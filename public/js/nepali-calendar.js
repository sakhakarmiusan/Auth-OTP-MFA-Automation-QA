/**
 * Nepali Calendar UI Component
 * Renders a premium Bikram Sambat calendar
 */
const NepaliCalendar = (() => {
    const NC = NepaliDateConverter;
    let currentBsYear, currentBsMonth;
    let todayBs;

    function init() {
        todayBs = NC.getToday();
        currentBsYear = todayBs.year;
        currentBsMonth = todayBs.month;

        document.getElementById('cal-prev').addEventListener('click', () => navigate(-1));
        document.getElementById('cal-next').addEventListener('click', () => navigate(1));
        document.getElementById('cal-today-btn').addEventListener('click', goToToday);

        render();
        updateTodayInfo();
    }

    function navigate(dir) {
        currentBsMonth += dir;
        if (currentBsMonth > 12) { currentBsMonth = 1; currentBsYear++; }
        if (currentBsMonth < 1) { currentBsMonth = 12; currentBsYear--; }
        render();
    }

    function goToToday() {
        currentBsYear = todayBs.year;
        currentBsMonth = todayBs.month;
        render();
    }

    function updateTodayInfo() {
        const el = document.getElementById('cal-today-info');
        if (!el) return;
        const dayName = NC.DAY_NAMES_NP[new Date().getDay()];
        el.textContent = `${dayName}, ${NC.MONTH_NAMES_NP[todayBs.month - 1]} ${NC.toNepaliNumeral(todayBs.day)}, ${NC.toNepaliNumeral(todayBs.year)}`;
    }

    function render() {
        const totalDays = NC.getDaysInBsMonth(currentBsYear, currentBsMonth);
        const firstDay = NC.getFirstDayOfMonth(currentBsYear, currentBsMonth);

        // Update header
        document.getElementById('cal-month-name').textContent =
            `${NC.MONTH_NAMES_NP[currentBsMonth - 1]} ${NC.toNepaliNumeral(currentBsYear)}`;
        document.getElementById('cal-month-en').textContent =
            `${NC.MONTH_NAMES_EN[currentBsMonth - 1]} ${currentBsYear} BS`;

        // AD equivalent range
        const adStart = NC.bsToAd(currentBsYear, currentBsMonth, 1);
        const adEnd = NC.bsToAd(currentBsYear, currentBsMonth, totalDays);
        const adMonths = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
        let adRange = `${adMonths[adStart.getMonth()]} ${adStart.getDate()}`;
        if (adStart.getMonth() !== adEnd.getMonth()) {
            adRange += ` – ${adMonths[adEnd.getMonth()]} ${adEnd.getDate()}, ${adEnd.getFullYear()}`;
        } else {
            adRange += ` – ${adEnd.getDate()}, ${adEnd.getFullYear()}`;
        }
        document.getElementById('cal-ad-range').textContent = adRange;

        // Build grid
        const grid = document.getElementById('cal-grid');
        grid.innerHTML = '';

        // Day name headers
        NC.DAY_NAMES_NP.forEach((name, i) => {
            const cell = document.createElement('div');
            cell.className = 'cal-day-header' + (i === 6 ? ' cal-saturday' : '');
            cell.textContent = name;
            grid.appendChild(cell);
        });

        // Empty cells before first day
        for (let i = 0; i < firstDay; i++) {
            const cell = document.createElement('div');
            cell.className = 'cal-day-cell cal-empty';
            grid.appendChild(cell);
        }

        // Date cells
        for (let d = 1; d <= totalDays; d++) {
            const cell = document.createElement('div');
            cell.className = 'cal-day-cell';

            const dayOfWeek = (firstDay + d - 1) % 7;
            if (dayOfWeek === 6) cell.classList.add('cal-saturday');

            const isToday = d === todayBs.day && currentBsMonth === todayBs.month && currentBsYear === todayBs.year;
            if (isToday) cell.classList.add('cal-today');

            // Nepali numeral
            const npNum = document.createElement('span');
            npNum.className = 'cal-np-num';
            npNum.textContent = NC.toNepaliNumeral(d);
            cell.appendChild(npNum);

            // Small AD date
            const adDate = NC.bsToAd(currentBsYear, currentBsMonth, d);
            const adSmall = document.createElement('span');
            adSmall.className = 'cal-ad-small';
            adSmall.textContent = `${adMonths[adDate.getMonth()]} ${adDate.getDate()}`;
            cell.appendChild(adSmall);

            grid.appendChild(cell);
        }
    }

    return { init };
})();
