import json
from datetime import date
from pathlib import Path
import tempfile
import unittest
from scripts.update_neis import fetch_rows, normalize_meal, normalize_event, ranges, update

class NeisTests(unittest.TestCase):
    def test_pagination(self):
        calls = []
        def request(params, endpoint):
            calls.append(params['pIndex'])
            return {endpoint: [{'head':[{'list_total_count': 2}, {'RESULT':{'CODE':'INFO-000'}}]}, {'row':[{'page':params['pIndex']}]}]}
        self.assertEqual(len(fetch_rows('SchoolSchedule', 'key', {}, request)), 2)
        self.assertEqual(calls, [1,2])

    def test_empty_and_api_error_differ(self):
        self.assertEqual(fetch_rows('x', 'key', {}, lambda *_: {'RESULT':{'CODE':'INFO-200'}}), [])
        with self.assertRaises(RuntimeError):
            fetch_rows('x', 'key', {}, lambda *_: {'RESULT':{'CODE':'ERROR-290'}})

    def test_failure_preserves_existing_snapshot(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'school.json'; p.write_text('old snapshot')
            def fail(endpoint, *_):
                if endpoint == 'SchoolSchedule': raise RuntimeError('offline')
                return []
            with self.assertRaises(RuntimeError): update('key', p, date(2026,11,5), fail)
            self.assertEqual(p.read_text(), 'old snapshot')
            with self.assertRaises(RuntimeError): update('', p)
            self.assertEqual(p.read_text(), 'old snapshot')

    def test_success_replaces_removed_events_and_has_no_key(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d)/'school.json'; p.write_text('{"events":["cancelled"]}')
            update('private-test-key', p, date(2026,11,5), lambda *_: [])
            saved = p.read_text()
            self.assertEqual(json.loads(saved)['events'], [])
            self.assertNotIn('private-test-key', saved)

    def test_allergens_and_grade_mapping(self):
        row = {'MLSV_YMD':'20261105','MMEAL_SC_CODE':'2','MMEAL_SC_NM':'중식','DDISH_NM':'밥<br/>우유(2)<br>샐러드&amp;소스'}
        self.assertEqual(normalize_meal(row)['dishes'], ['밥','우유(2)','샐러드&소스'])
        e = normalize_event({'AA_YMD':'20261105','EVENT_NM':'시험','ONE_GRADE_EVENT_YN':'N','TW_GRADE_EVENT_YN':'Y','THREE_GRADE_EVENT_YN':'N'})
        self.assertEqual(e['grades'], [2]); self.assertFalse(e['gradeUnknown'])

    def test_year_and_leap_boundaries(self):
        self.assertEqual(ranges(date(2026,12,31))[:2], ('20261101','20270131'))
        self.assertEqual(ranges(date(2028,1,31))[2:], ('20270301','20280229'))
        self.assertEqual(ranges(date(2027,2,28))[2:], ('20260301','20270331'))

if __name__ == '__main__': unittest.main()
