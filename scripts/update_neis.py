"""Fetch a complete NEIS snapshot. Never write a partial or sample response."""
import calendar
import html
import json
import os
from pathlib import Path
import re
import sys
import time
from datetime import datetime, timedelta
from urllib.parse import urlencode
from urllib.request import urlopen
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
SCHOOL = {'ATPT_OFCDC_SC_CODE': 'J10', 'SD_SCHUL_CODE': '7531103'}


def request_json(params, endpoint):
    url = 'https://open.neis.go.kr/hub/' + endpoint + '?' + urlencode(params)
    for attempt in range(3):
        try:
            with urlopen(url, timeout=30) as response:
                return json.load(response)
        except Exception:
            if attempt == 2:
                # URLs contain the key: never print exceptions or response bodies.
                raise RuntimeError('NEIS 연결 또는 응답 해석 실패') from None
            time.sleep(2 ** attempt)


def fetch_rows(endpoint, key, filters, request=request_json):
    rows = []
    for page in range(1, 101):
        data = request(dict(SCHOOL, KEY=key, Type='json', pIndex=page,
                            pSize=1000, **filters), endpoint)
        result = data.get('RESULT')
        if result:
            if result.get('CODE') == 'INFO-200' and page == 1:
                return []
            raise RuntimeError('NEIS API 오류 또는 불완전한 페이지')
        blocks = data.get(endpoint, [])
        head = next((b['head'] for b in blocks if 'head' in b), [])
        status = next((h['RESULT'].get('CODE') for h in head if 'RESULT' in h), None)
        total = next((h['list_total_count'] for h in head if 'list_total_count' in h), None)
        batch = next((b['row'] for b in blocks if 'row' in b), None)
        if status != 'INFO-000' or not isinstance(total, int) or not isinstance(batch, list):
            raise RuntimeError('NEIS 응답 형식 오류')
        if not batch and len(rows) < total:
            raise RuntimeError('NEIS 데이터 일부 누락')
        rows.extend(batch)
        if len(rows) == total:
            return rows
        if len(rows) > total:
            raise RuntimeError('NEIS 데이터 건수 불일치')
    raise RuntimeError('NEIS 페이지 한도 초과')


def clean(value):
    return html.unescape(re.sub(r'<[^>]*>', '', str(value or ''))).strip()


def valid_date(value):
    datetime.strptime(value, '%Y%m%d')
    return value


def normalize_meal(row):
    return {'date': valid_date(row['MLSV_YMD']), 'type': row['MMEAL_SC_CODE'],
            'name': clean(row['MMEAL_SC_NM']),
            'dishes': [clean(s) for s in re.split(r'<br\s*/?>', row['DDISH_NM'], flags=re.I) if clean(s)],
            'calories': clean(row.get('CAL_INFO'))}


def normalize_event(row):
    fields = ['ONE_GRADE_EVENT_YN', 'TW_GRADE_EVENT_YN', 'THREE_GRADE_EVENT_YN']
    return {'date': valid_date(row['AA_YMD']), 'name': clean(row['EVENT_NM']),
            'description': clean(row.get('EVENT_CNTNT')),
            'grades': [i + 1 for i, field in enumerate(fields) if row.get(field) == 'Y'],
            'gradeUnknown': all(row.get(field) not in ('Y', 'N') for field in fields)}


def ranges(today):
    first = today.replace(day=1)
    start = (first - timedelta(days=1)).replace(day=1)
    next_month = (first + timedelta(days=32)).replace(day=1)
    end = next_month.replace(day=calendar.monthrange(next_month.year, next_month.month)[1])
    year = today.year if today.month >= 3 else today.year - 1
    # Include next academic year's events near the February boundary.
    schedule_end = max(end, today.replace(year=year + 1, month=2, day=28))
    if calendar.isleap(year + 1):
        schedule_end = max(schedule_end, today.replace(year=year + 1, month=2, day=29))
    return start.strftime('%Y%m%d'), end.strftime('%Y%m%d'), f'{year}0301', schedule_end.strftime('%Y%m%d')


def update(key, destination=ROOT / 'data/school.json', today=None, fetch=fetch_rows):
    if not key:
        raise RuntimeError('GitHub Secrets에 NEIS_API_KEY를 등록하세요.')
    today = today or datetime.now(ZoneInfo('Asia/Seoul')).date()
    meal_from, meal_to, event_from, event_to = ranges(today)
    meals = fetch('mealServiceDietInfo', key, {'MLSV_FROM_YMD': meal_from, 'MLSV_TO_YMD': meal_to})
    events = fetch('SchoolSchedule', key, {'AA_FROM_YMD': event_from, 'AA_TO_YMD': event_to})
    payload = {'version': 1, 'school': '운양고등학교', 'updatedAt': datetime.now(ZoneInfo('Asia/Seoul')).isoformat(),
               'coverage': {'meals': [meal_from, meal_to], 'events': [event_from, event_to]},
               'meals': sorted([normalize_meal(r) for r in meals], key=lambda r: (r['date'], r['type'])),
               'events': sorted([normalize_event(r) for r in events], key=lambda r: (r['date'], r['name']))}
    destination.parent.mkdir(parents=True, exist_ok=True)
    temporary = destination.with_suffix('.tmp')
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')
    temporary.replace(destination)
    print(f"갱신 완료: 급식 {len(meals)}건, 일정 {len(events)}건")


if __name__ == '__main__':
    try:
        update(os.environ.get('NEIS_API_KEY', ''))
    except Exception:
        print('갱신 실패: 인증키·나이스 연결·응답을 확인하세요. 기존 데이터는 유지됩니다.', file=sys.stderr)
        sys.exit(1)
