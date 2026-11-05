/* Public snapshots only: API keys never enter the browser. */
const SchoolData = (() => {
    let snapshot = null;
    let failed = false;
    let loading = false;
    const el = id => document.getElementById(id);
    const today = () => new Intl.DateTimeFormat('sv-SE', {timeZone:'Asia/Seoul'}).format(new Date()).replaceAll('-', '');
    const dateLabel = date => `${date.slice(0,4)}/${date.slice(4,6)}/${date.slice(6,8)}`;
    const inCoverage = (kind, date) => snapshot && date >= snapshot.coverage[kind][0] && date <= snapshot.coverage[kind][1];
    const forGrade = event => event.gradeUnknown || event.grades.includes(Number(el('gradeSelect').value));
    const emptyMessage = () => failed ? '정보를 불러오지 못했습니다. 잠시 후 새로고침해 주세요.' : '아직 자동 갱신된 정보가 없습니다.';
    function message(container, text) { container.replaceChildren(); const p = document.createElement('p'); p.textContent = text; container.append(p); }
    function list(container, rows, text) {
        container.replaceChildren();
        for (const row of rows) {
            const p = document.createElement('p');
            p.style.whiteSpace = 'pre-line';
            p.style.lineHeight = '1.8';
            p.textContent = text(row); // Never insert API strings as HTML.
            container.append(p);
        }
    }
    const mealText = meal => `${dateLabel(meal.date)} · ${meal.name}\n${meal.dishes.join('\n')}${meal.calories ? '\n' + meal.calories : ''}`;
    function renderMonth(kind) {
        const meals = kind === 'meals';
        const input = el(meals ? 'mealMonth' : 'eventMonth');
        const target = el(meals ? 'monthlyMeals' : 'monthlyEvents');
        if (!snapshot?.updatedAt) return message(target, emptyMessage());
        const month = input.value.replace('-', '');
        if (!month) return message(target, '조회할 월을 선택해 주세요.');
        const range = snapshot.coverage[kind];
        if (month < range[0].slice(0,6) || month > range[1].slice(0,6)) return message(target, '수집 범위 밖의 월입니다. 조회 가능한 월을 선택해 주세요.');
        const rows = snapshot[kind].filter(r => r.date.startsWith(month) && (meals || forGrade(r)));
        if (!rows.length) return message(target, '이 달에 등록된 정보가 없습니다.');
        list(target, rows, meals ? mealText : r => `${dateLabel(r.date)} · ${r.name}${r.description ? '\n' + r.description : ''}`);
    }
    function badge(id, label, pattern) {
        const event = snapshot?.updatedAt && snapshot.events.find(r => r.date >= today() && forGrade(r) && pattern.test(r.name));
        if (!event) { el(id).textContent = `${label} 일정 미등록`; return; }
        const asUTC = value => Date.UTC(+value.slice(0,4), +value.slice(4,6)-1, +value.slice(6,8));
        const days = Math.round((asUTC(event.date) - asUTC(today())) / 86400000);
        el(id).textContent = `${label} ${days === 0 ? 'D-Day' : 'D-' + days}`;
        el(id).title = `${dateLabel(event.date)} ${event.name}`;
    }
    function render() {
        const date = today();
        el('lunchTitle').textContent = `${date.slice(4,6)}/${date.slice(6,8)} 급식`;
        if (!snapshot?.updatedAt) {
            el('lunchContent').textContent = emptyMessage();
            message(el('recentEvents'), emptyMessage());
        } else {
            const meals = snapshot.meals.filter(m => m.date === date && m.type === '2');
            el('lunchContent').textContent = !inCoverage('meals', date) ? '오늘은 저장된 급식 데이터의 조회 범위 밖입니다.' : meals.length ? meals.map(m => m.dishes.join('\n') + (m.calories ? '\n' + m.calories : '')).join('\n\n') : '오늘 등록된 중식 정보가 없습니다.';
            const upcoming = snapshot.events.filter(r => r.date >= date && forGrade(r) && !/토요휴업일/.test(r.name)).slice(0, 5);
            list(el('recentEvents'), upcoming, r => `${dateLabel(r.date)} · ${r.name}`);
            if (!upcoming.length) message(el('recentEvents'), '조회 범위 안에 등록된 예정 일정이 없습니다.');
        }
        const status = el('dataStatus');
        if (snapshot?.updatedAt) {
            const age = Date.now() - new Date(snapshot.updatedAt).getTime();
            status.textContent = `출처: 나이스 · 마지막 갱신: ${new Date(snapshot.updatedAt).toLocaleString('ko-KR', {timeZone:'Asia/Seoul'})} (한국시간)`;
            if (failed) status.textContent += ' · 새로고침 실패, 이전 자료 표시 중';
            if (age > 48 * 3600000) status.textContent += ' · 갱신이 지연되고 있습니다. 학교 공지를 확인해 주세요.';
        } else status.textContent = emptyMessage();
        badge('examDdayBadge', '📝 지필고사', /정기시험|지필|중간고사|기말고사/);
        badge('vacationBadge', '🌴 방학', /방학식/);
        badge('csatBadge', '🎯 수능', /^(대학수학능력시험|수능)(\s*\(.*\))?$/);
        renderMonth('meals'); renderMonth('events');
    }
    function valid(data) {
        return data?.version === 1 && data.school === '운양고등학교' &&
            Array.isArray(data.meals) && Array.isArray(data.events) &&
            data.meals.every(m => /^\d{8}$/.test(m.date) && typeof m.type === 'string' && typeof m.name === 'string' && Array.isArray(m.dishes) && m.dishes.every(s => typeof s === 'string')) &&
            data.events.every(e => /^\d{8}$/.test(e.date) && typeof e.name === 'string' && Array.isArray(e.grades)) &&
            ['meals','events'].every(k => Array.isArray(data.coverage?.[k]) && (!data.updatedAt || (data.coverage[k].length === 2 && data.coverage[k].every(d => /^\d{8}$/.test(d))))) &&
            (data.updatedAt === null || Number.isFinite(Date.parse(data.updatedAt)));
    }
    async function load() {
        if (loading) return;
        loading = true;
        el('dataStatus').textContent = '최신 정보를 확인하고 있습니다…';
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 15000);
        try {
            const response = await fetch('data/school.json', {cache:'no-store', signal:controller.signal});
            if (!response.ok) throw new Error('snapshot unavailable');
            const data = await response.json();
            if (!valid(data)) throw new Error('invalid snapshot');
            snapshot = data;
            failed = false;
            for (const [id, kind] of [['mealMonth','meals'], ['eventMonth','events']]) {
                const input = el(id);
                if (!input.value) input.value = `${today().slice(0,4)}-${today().slice(4,6)}`;
                const range = data.coverage[kind];
                if (range.length === 2) {
                    input.min = `${range[0].slice(0,4)}-${range[0].slice(4,6)}`;
                    input.max = `${range[1].slice(0,4)}-${range[1].slice(4,6)}`;
                }
            }
        } catch { failed = true; }
        finally { clearTimeout(timer); loading = false; render(); }
    }
    document.addEventListener('DOMContentLoaded', () => {
        el('mealMonth').addEventListener('change', () => renderMonth('meals'));
        el('eventMonth').addEventListener('change', () => renderMonth('events'));
    });
    return {load};
})();
