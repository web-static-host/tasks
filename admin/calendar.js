// ==========================================
// ВКЛАДКА: ПРОИЗВОДСТВЕННЫЙ КАЛЕНДАРЬ
// ==========================================
// Хранение: localStorage (ключ 'production_calendar')
// Структура: { "2026": { holidays: [...], short_days: [...], working_weekends: [...] }, "2027": {...} }

let calendarData = {};
let currentCalendarYear = '2026';
let calendarDirty = false; // флаг "несохранённых изменений"

window.loadAdminCalendar = async function() {
    // 1. МГНОВЕННО: берём из кэша
    try {
        const raw = localStorage.getItem('production_calendar');
        calendarData = raw ? JSON.parse(raw) : {};
    } catch (e) {
        calendarData = {};
    }

    // Слушатель смены года
    const yearSelect = document.getElementById('calendar-year-select');
    if (yearSelect && !yearSelect.dataset.bound) {
        yearSelect.addEventListener('change', () => {
            if (calendarDirty && !confirm('Есть несохранённые изменения. Переключиться без сохранения?')) {
                yearSelect.value = currentCalendarYear;
                return;
            }
            currentCalendarYear = yearSelect.value;
            calendarDirty = false;
            renderCalendar();
        });
        yearSelect.dataset.bound = '1';
    }

    currentCalendarYear = yearSelect?.value || '2026';
    renderCalendar(); // Сразу показываем из кэша

    // 2. ФОНОВО: синхронизируем из БД
    try {
        const { data: rows, error } = await supabase
            .from('production_calendar')
            .select('year, data');

        if (error) throw error;

        if (rows && rows.length > 0) {
            const freshCalendar = {};
            rows.forEach(row => {
                freshCalendar[String(row.year)] = row.data;
            });

            // Обновляем только если данные отличаются от кэша
            if (JSON.stringify(freshCalendar) !== JSON.stringify(calendarData)) {
                calendarData = freshCalendar;
                localStorage.setItem('production_calendar', JSON.stringify(calendarData));
                renderCalendar(); // Перерисовываем с актуальными данными
            }
        }
    } catch (e) {
        console.error('Ошибка загрузки календаря из БД:', e);
    }
};

function getYearData() {
    // Только инициализируем поля если год уже существует — не создаём пустой год автоматически
    if (!calendarData[currentCalendarYear]) {
        return { holidays: [], short_days: [], working_weekends: [], _missing: true };
    }
    const y = calendarData[currentCalendarYear];
    if (!y.holidays) y.holidays = [];
    if (!y.short_days) y.short_days = [];
    if (!y.working_weekends) y.working_weekends = [];
    return y;
}

function formatRuDate(dateStr) {
    const d = new Date(dateStr);
    return d.toLocaleDateString('ru-RU', { day: '2-digit', month: 'long', weekday: 'short' });
}

// Подсчёт статистики (рабочих/выходных дней с учётом календаря)
function calculateStats(year, data) {
    const yearNum = Number(year);
    const holidays = new Set((data.holidays || []).map(h => typeof h === 'string' ? h : h.date));
    const workingWeekends = new Set(data.working_weekends || []);

    let working = 0, off = 0;
    for (let m = 0; m < 12; m++) {
        const lastDay = new Date(yearNum, m + 1, 0).getDate();
        for (let d = 1; d <= lastDay; d++) {
            const dateStr = formatISODate(yearNum, m + 1, d);
            const dt = new Date(yearNum, m, d);
            const dayOfWeek = dt.getDay(); // 0 = вс, 6 = сб
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isHoliday = holidays.has(dateStr);
            const isWorkingWeekend = workingWeekends.has(dateStr);

            if ((isWeekend && !isWorkingWeekend) || isHoliday) off++;
            else working++;
        }
    }
    return { working, off, total: working + off };
}

// Главная функция отрисовки вкладки
function renderCalendar() {
    const data = getYearData();
    const yearNum = Number(currentCalendarYear);

    // Статистика
    const stats = calculateStats(currentCalendarYear, data);
    const statsEl = document.getElementById('calendar-stats');
    if (statsEl) {
        statsEl.innerText = `${currentCalendarYear} год · ${stats.working} рабочих · ${stats.off} выходных и праздничных`;
    }

    const isEmpty = data.holidays.length === 0 && data.short_days.length === 0;
    const emptyState = document.getElementById('calendar-empty-state');
    const legend = document.getElementById('calendar-legend');
    const grid = document.getElementById('calendar-months-grid');

    if (emptyState) emptyState.classList.toggle('d-none', !isEmpty);
    if (legend) legend.classList.toggle('d-none', isEmpty);
    if (grid) grid.classList.toggle('d-none', isEmpty);

    // Если пусто — очищаем сетку и выходим
    if (isEmpty) {
        if (grid) grid.innerHTML = '';
        return;
    }

    const monthNames = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
                        'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
    const weekdayLabels = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];

    // Map для быстрой проверки + название праздника
    const holidayMap = {};
    (data.holidays || []).forEach(h => {
        const date = typeof h === 'string' ? h : h.date;
        const name = typeof h === 'string' ? '' : (h.name || '');
        holidayMap[date] = name;
    });
    const shortSet = new Set(data.short_days || []);
    const workingWeekendSet = new Set(data.working_weekends || []);

    let html = '';
    for (let m = 0; m < 12; m++) {
        const lastDay = new Date(yearNum, m + 1, 0).getDate();
        const firstDayOfWeek = new Date(yearNum, m, 1).getDay(); // 0 = вс
        const offset = firstDayOfWeek === 0 ? 6 : firstDayOfWeek - 1; // сдвиг чтобы пн был первым

        let cells = '';
        // Пустые ячейки до 1-го числа
        for (let i = 0; i < offset; i++) {
            cells += `<div class="cal-day cal-empty"></div>`;
        }

        for (let d = 1; d <= lastDay; d++) {
            const dateStr = formatISODate(yearNum, m + 1, d);
            const dt = new Date(yearNum, m, d);
            const dayOfWeek = dt.getDay();
            const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
            const isHoliday = dateStr in holidayMap;
            const isShort = shortSet.has(dateStr);
            const isWorkingWeekend = workingWeekendSet.has(dateStr);

            // Определяем визуальный класс
            let cls = 'cal-day';
            let title = '';

            // Выходной = праздник или (сб/вс и НЕ рабочий выходной)
            const isOff = isHoliday || (isWeekend && !isWorkingWeekend);

            if (isOff) {
                cls += ' cal-holiday';
                title = isHoliday ? (holidayMap[dateStr] || 'Праздник') : 'Выходной';
            } else if (isShort) {
                cls += ' cal-short';
                title = 'Сокращённый день (-1 час)';
            }

            cells += `<div class="${cls}" data-date="${dateStr}" title="${title}" onclick="onCalendarDayClick('${dateStr}')">${d}</div>`;
        }

        html += `
            <div class="col-3" style="padding-left: 6px; padding-right: 6px;">
                <div class="cal-month-card">
                    <div class="cal-month-title">${monthNames[m]}</div>
                    <div class="cal-weekdays">
                        ${weekdayLabels.map(w => `<div>${w}</div>`).join('')}
                    </div>
                    <div class="cal-days">${cells}</div>
                </div>
            </div>`;
    }

    grid.innerHTML = html;
}

// Переключение статуса дня по клику
window.onCalendarDayClick = function(dateStr) {
    // Создаём год только когда пользователь реально кликнул — не раньше
    if (!calendarData[currentCalendarYear]) {
        calendarData[currentCalendarYear] = { holidays: [], short_days: [], working_weekends: [] };
    }
    const data = getYearData();
    const isHoliday = data.holidays.some(h => (typeof h === 'string' ? h : h.date) === dateStr);
    const isShort = data.short_days.includes(dateStr);

    // Цикл: обычный → праздник → сокращённый → обычный
    if (!isHoliday && !isShort) {
        // Стал праздником
        const name = prompt('Название праздника (необязательно):', '') || '';
        data.holidays.push(name ? { date: dateStr, name } : dateStr);
    } else if (isHoliday) {
        // Был праздником → стал сокращённым
        data.holidays = data.holidays.filter(h => (typeof h === 'string' ? h : h.date) !== dateStr);
        data.short_days.push(dateStr);
    } else {
        // Был сокращённым → стал обычным
        data.short_days = data.short_days.filter(d => d !== dateStr);
    }

    markDirty();
    renderCalendar();
};

function markDirty() {
    calendarDirty = true;
}

// === ДОБАВЛЕНИЕ ===
window.addHoliday = function() {
    const dateInput = document.getElementById('new-holiday-date');
    const nameInput = document.getElementById('new-holiday-name');
    const date = dateInput.value;
    if (!date) { alert('Выберите дату'); return; }
    if (!date.startsWith(currentCalendarYear)) {
        if (!confirm(`Дата ${date} не из ${currentCalendarYear} года. Всё равно добавить в ${currentCalendarYear}?`)) return;
    }
    const data = getYearData();
    if (data.holidays.some(h => (h.date || h) === date)) { alert('Эта дата уже добавлена'); return; }

    data.holidays.push(nameInput.value.trim() ? { date, name: nameInput.value.trim() } : date);
    dateInput.value = ''; nameInput.value = '';
    markDirty();
    renderCalendar();
};

window.addShortDay = function() {
    const input = document.getElementById('new-short-date');
    const date = input.value;
    if (!date) { alert('Выберите дату'); return; }
    const data = getYearData();
    if (data.short_days.includes(date)) { alert('Уже добавлена'); return; }
    data.short_days.push(date);
    input.value = '';
    markDirty();
    renderCalendar();
};

window.addWorkingWeekend = function() {
    const input = document.getElementById('new-working-weekend');
    const date = input.value;
    if (!date) { alert('Выберите дату'); return; }
    const data = getYearData();
    if (data.working_weekends.includes(date)) { alert('Уже добавлена'); return; }
    data.working_weekends.push(date);
    input.value = '';
    markDirty();
    renderCalendar();
};

// === УДАЛЕНИЕ ===
window.removeHoliday = function(idx) {
    getYearData().holidays.splice(idx, 1);
    markDirty(); renderCalendar();
};
window.removeShortDay = function(idx) {
    getYearData().short_days.splice(idx, 1);
    markDirty(); renderCalendar();
};
window.removeWorkingWeekend = function(idx) {
    getYearData().working_weekends.splice(idx, 1);
    markDirty(); renderCalendar();
};

// === СОХРАНЕНИЕ ===
window.saveCalendar = async function() {
    const btn = document.querySelector('#tab-calendar button.btn-success');
    if (btn) { btn.disabled = true; btn.innerText = 'Сохранение...'; }

    try {
        const year = Number(currentCalendarYear);
        const data = getYearData();

        // Проверяем — есть ли уже запись за этот год
        const { data: existing } = await supabase
            .from('production_calendar')
            .select('id')
            .eq('year', year)
            .single();

        let error;
        if (existing) {
            // Обновляем существующую
            ({ error } = await supabase
                .from('production_calendar')
                .update({ data })
                .eq('year', year));
        } else {
            // Создаём новую
            ({ error } = await supabase
                .from('production_calendar')
                .insert({ year, data }));
        }
        if (error) throw error;

        // Кэшируем в localStorage чтобы не грузить из БД каждый раз
        localStorage.setItem('production_calendar', JSON.stringify(calendarData));
        calendarDirty = false;
        alert('✅ Календарь сохранён для всех пользователей.');
    } catch (e) {
        alert('Ошибка сохранения: ' + e.message);
    } finally {
        if (btn) { btn.disabled = false; btn.innerText = '💾 Сохранить'; }
    }
};

// === ИМПОРТ / ЭКСПОРТ ===
window.exportCalendarJson = function() {
    const blob = new Blob([JSON.stringify(calendarData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `production_calendar_${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
};

window.importCalendarJson = function(event) {
    const file = event.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
        try {
            const imported = JSON.parse(e.target.result);
            if (typeof imported !== 'object') throw new Error('Неверный формат');
            if (!confirm('Это заменит текущие данные календаря. Продолжить?')) return;
            calendarData = imported;
            markDirty();
            renderCalendar();
            alert('✅ Импортировано. Не забудьте нажать «Сохранить».');
        } catch (err) {
            alert('Ошибка импорта: ' + err.message);
        }
    };
    reader.readAsText(file);
    event.target.value = ''; // сбросить input чтобы можно было загрузить тот же файл повторно
};

// ============================================================
// ПАРСЕР PDF ПРОИЗВОДСТВЕННОГО КАЛЕНДАРЯ
// ============================================================

// Карта названий месяцев из текста PDF в номера месяцев
const RU_MONTHS = {
    'январ': 1, 'феврал': 2, 'март': 3, 'апрел': 4, 'ма': 5, 'мая': 5,
    'июн': 6, 'июл': 7, 'август': 8, 'сентябр': 9, 'октябр': 10, 'ноябр': 11, 'декабр': 12
};

// Универсальная функция: получает корень слова месяца → номер месяца
function findMonth(word) {
    const lower = word.toLowerCase();
    for (const [key, val] of Object.entries(RU_MONTHS)) {
        if (lower.startsWith(key)) return val;
    }
    return null;
}

// Формат YYYY-MM-DD из (год, месяц, день)
function formatISODate(year, month, day) {
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

// === ОСНОВНАЯ ФУНКЦИЯ ПАРСИНГА ===
function parseCalendarPdf(fullText) {
    // Чистим текст: убираем множественные пробелы, склеиваем разорванные годы.
    // PDF может выдавать год по-разному: "2026", "202 6", "20 26", "2 026" — обрабатываем все случаи
    let text = fullText.replace(/\s+/g, ' ');
    // Склеиваем 4-значные годы, разорванные ЛЮБЫМ количеством пробелов внутри
    text = text.replace(/\b(\d)\s+(\d)\s+(\d)\s+(\d)\b/g, '$1$2$3$4'); // "2 0 2 6" → "2026"
    text = text.replace(/\b(\d{2})\s+(\d{2})\b/g, (m, a, b) => {
        // Склеиваем только если получается похоже на год (20XX или 19XX)
        if ((a === '19' || a === '20') && /^\d{2}$/.test(b)) return a + b;
        return m;
    });
    text = text.replace(/\b(\d{3})\s+(\d)\b/g, (m, a, b) => {
        if (a.startsWith('19') || a.startsWith('20')) return a + b;
        return m;
    });
    text = text.replace(/\b(\d)\s+(\d{3})\b/g, (m, a, b) => {
        if (b.startsWith('9') || b.startsWith('0')) return a + b; // "2 026"
        return m;
    });

    // Определяем год из заголовка "КАЛЕНДАРЬ НА 2026 ГОД"
    const yearMatch = text.match(/КАЛЕНДАРЬ\s+НА\s+(\d{4})\s+ГОД/i);
    const year = yearMatch ? yearMatch[1] : null;
    if (!year) {
        console.error('Текст после очистки (первые 500 символов):', text.substring(0, 500));
        throw new Error('Не удалось определить год календаря из PDF');
    }

    const result = {
        year,
        holidays: [],      // [{date, name}]
        short_days: [],    // ["YYYY-MM-DD"]
        working_weekends: [] // ["YYYY-MM-DD"]
    };

    // ============================================================
    // 1. ПРАЗДНИКИ — ищем после фразы "нерабочие праздничные дни в Российской Федерации:"
    // ============================================================
    const holidayBlockMatch = text.match(/нерабочие праздничные дни в Российской Федерации\s*:?\s*(.+?)Согласно статье/i);
    if (holidayBlockMatch) {
        const block = holidayBlockMatch[1];
        // Разбиваем по символу ";" — каждая строка типа "1, 2, 3, 4, 5, 6 и 8 января – Новогодние каникулы"
        const lines = block.split(/[;.]/).map(l => l.trim()).filter(Boolean);

        for (const line of lines) {
            // Ищем месяц в строке
            const wordsInLine = line.split(/[\s,–—-]+/);
            let monthNum = null;
            for (const w of wordsInLine) {
                const m = findMonth(w);
                if (m) { monthNum = m; break; }
            }
            if (!monthNum) continue;

            // Извлекаем все числа до названия месяца — это и есть дни
            const beforeMonth = line.split(new RegExp(wordsInLine.find(w => findMonth(w))))[0];
            const days = beforeMonth.match(/\d+/g)?.map(Number).filter(n => n >= 1 && n <= 31) || [];

            // Извлекаем название праздника (после тире)
            const nameMatch = line.match(/[–—-]\s*([А-Яа-яё ]+?)$/);
            const holidayName = nameMatch ? nameMatch[1].trim() : '';

            for (const day of days) {
                result.holidays.push({
                    date: formatISODate(year, monthNum, day),
                    name: holidayName
                });
            }
        }
    }

    // ============================================================
    // 2. ПЕРЕНОСЫ ВЫХОДНЫХ — после "перенесены следующие выходные дни:"
    //    "с субботы 3 января на пятницу 9 января"
    //    Из такого блока: 9 января становится РАБОЧИМ выходным (working_weekends),
    //    А 3 января — добавляется в holidays (мы уже его учли как праздник, но всё равно проверим)
    // ============================================================
    const transferBlockMatch = text.match(/перенесены следующие[^:]*:\s*(.+?)Следовательно/i);
    if (transferBlockMatch) {
        const block = transferBlockMatch[1];
        // Каждая фраза "с <день недели> X <месяц> на <день недели> Y <месяц>"
        const transferRegex = /с\s+\S+\s+(\d{1,2})\s+(\S+)\s+на\s+\S+\s+(\d{1,2})\s+(\S+)/gi;
        let m;
        while ((m = transferRegex.exec(block)) !== null) {
            const fromDay = Number(m[1]);
            const fromMonth = findMonth(m[2]);
            const toDay = Number(m[3]);
            const toMonth = findMonth(m[4]);

            if (!fromMonth || !toMonth) continue;

            // День "куда перенесли" (toDay) был выходным днём недели — теперь стал рабочим
            // НО: для нашей системы важнее обратное — день, на который ПЕРЕНЕСЛИ выходной,
            // обычно становится нерабочим (это и есть праздничный день).
            // А день, ОТКУДА перенесли — был выходным, теперь стал рабочим.
            // Из текста "с субботы 3 на пятницу 9" → 3 (суббота) ОТКУДА, 9 (пятница) КУДА.
            // → 9 января = нерабочий (праздник), 3 января = рабочая суббота? НЕТ!
            // На самом деле по ТК: "с субботы 3 на пятницу 9" означает "выходной С 3 января перенесли НА 9 января".
            // То есть 9 января — выходной (праздник), а 3 января — рабочий день (хотя это суббота).
            //
            // Но 3 января уже и так в списке "Новогодние каникулы" из ст. 112 ТК!
            // А из этого блока мы узнаём что 9 января 2026 — выходной (хотя это пятница!) и должен быть в holidays.
            // Также узнаём что 31 декабря 2026 (хотя четверг) — выходной → тоже в holidays.

            const moveTo = formatISODate(year, toMonth, toDay);
            // Добавляем в праздники, если ещё нет
            if (!result.holidays.some(h => h.date === moveTo)) {
                result.holidays.push({ date: moveTo, name: 'Перенесённый выходной' });
            }
            // Дополнительно: если day-of-week у moveTo это будний день (Пн-Пт),
            // то это нерабочий праздник. Если это сб/вс — то ничего особенного не делаем
            // (потому что суббота/воскресенье и так выходные по умолчанию).
        }
    }

    // ============================================================
    // 3. СОКРАЩЁННЫЕ ДНИ — после "будут работать на один час меньше"
    //    "30 апреля, 8 мая, 11 июня, 3 ноября"
    // ============================================================
    const shortBlockMatch = text.match(/будут работать на один час меньше\s+([^.]+?)\(накануне/i);
    if (shortBlockMatch) {
        const block = shortBlockMatch[1];
        console.log('Блок сокращённых дней:', block);

        // Простой парсинг: ищем все пары "число + название_месяца"
        const pairRegex = /(\d{1,2})\s+([А-Яа-яё]+)/g;
        let m;
        while ((m = pairRegex.exec(block)) !== null) {
            const day = Number(m[1]);
            const month = findMonth(m[2]);
            if (month && day >= 1 && day <= 31) {
                result.short_days.push(formatISODate(year, month, day));
            }
        }
    }

    // Удаляем дубликаты из праздников и сортируем
    const seen = new Set();
    result.holidays = result.holidays.filter(h => {
        if (seen.has(h.date)) return false;
        seen.add(h.date);
        return true;
    }).sort((a, b) => a.date.localeCompare(b.date));

    result.short_days = [...new Set(result.short_days)].sort();
    result.working_weekends = [...new Set(result.working_weekends)].sort();

    return result;
}

// === ИМПОРТ PDF ===
window.importCalendarPdf = async function(event) {
    const file = event.target.files[0];
    if (!file) return;
    event.target.value = '';

    if (typeof pdfjsLib === 'undefined') {
        alert('Библиотека pdf.js не загружена. Проверь подключение скрипта в admin.html.');
        return;
    }

    try {
        const buffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: buffer }).promise;

        // Собираем весь текст
        let fullText = '';
        for (let i = 1; i <= pdf.numPages; i++) {
            const page = await pdf.getPage(i);
            const content = await page.getTextContent();
            fullText += content.items.map(item => item.str).join(' ') + ' ';
        }

        // Парсим
        const parsed = parseCalendarPdf(fullText);

        // Вывод результата для проверки
        console.log('📋 Распарсенный календарь:', parsed);

        const summary = `📅 Распарсено из PDF (${parsed.year} год):

🎉 Праздники: ${parsed.holidays.length}
${parsed.holidays.map(h => `  • ${h.date} — ${h.name || '(без названия)'}`).join('\n')}

⏰ Сокращённые дни: ${parsed.short_days.length}
${parsed.short_days.map(d => `  • ${d}`).join('\n')}

Применить эти данные к ${parsed.year} году? (Не забудь нажать "Сохранить" после применения!)`;

        if (!confirm(summary)) return;

        // Применяем результат
        if (!calendarData[parsed.year]) {
            calendarData[parsed.year] = { holidays: [], short_days: [], working_weekends: [] };
        }
        calendarData[parsed.year].holidays = parsed.holidays;
        calendarData[parsed.year].short_days = parsed.short_days;
        calendarData[parsed.year].working_weekends = parsed.working_weekends;

        // Переключаемся на год из PDF и перерисовываем
        currentCalendarYear = parsed.year;
        const yearSelect = document.getElementById('calendar-year-select');
        if (yearSelect) yearSelect.value = parsed.year;

        markDirty();
        renderCalendar();

        alert(`✅ Импорт завершён. Не забудь нажать «Сохранить»!`);
    } catch (e) {
        console.error('Ошибка парсинга PDF:', e);
        alert('Не удалось распарсить PDF: ' + e.message);
    }
};