// Вызывай это ПЕРВЫМ ДЕЛОМ в initApp или в самом верху initFilters
function applySavedFiltersVisuals() {
    const hideDone = document.getElementById('hideDone');
    const onlyMyTasks = document.getElementById('onlyMyTasks');
    const customDate = document.getElementById('filterCustomDate');

    // Мгновенно ставим галочки из кэша
    if (hideDone) {
        hideDone.checked = localStorage.getItem('hideDone') === 'true';
    }
    if (onlyMyTasks) {
        const isOnlyMy = localStorage.getItem('onlyMyTasks') === 'true';
        onlyMyTasks.checked = isOnlyMy;
        onlyMyTasksFilter = isOnlyMy; // Обновляем глобальную переменную сразу
    }

    // Ставим радиокнопки даты
    const savedDateFilter = localStorage.getItem('dateFilter') || 'all';
    const activeRadio = document.querySelector(`input[name="filterDate"][value="${savedDateFilter}"]`);
    if (activeRadio) activeRadio.checked = true;
    
    // Если была своя дата, подставляем её
    if (savedDateFilter === 'custom' && customDate) {
        const savedCustom = localStorage.getItem('customDateVal');
        if (savedCustom) customDate.value = savedCustom;
    }
}

window.activeTechFilter = localStorage.getItem('activeTechFilter') || ''; 
window.currentTable = 'tasks'; 
window.onlyMyTasksFilter = false;

// 1. Инициализация переключателей вкладок (Платные/Бесплатные)
function initTableTabs() {
    const paidTab = document.getElementById('paid-tasks-tab');
    const freeTab = document.getElementById('free-tasks-tab');

    if (paidTab && freeTab) {
        paidTab.addEventListener('click', () => {
            currentTable = 'tasks';
            paidTab.classList.add('active');
            freeTab.classList.remove('active');
            loadTasks();
        });
        freeTab.addEventListener('click', () => {
            currentTable = 'free_tasks';
            freeTab.classList.add('active');
            paidTab.classList.remove('active');
            loadTasks();
        });
    }
}

// Переключение фильтра по технарям
window.setTechFilter = (techName, btn) => {
    window.activeTechFilter = techName;
    localStorage.setItem('activeTechFilter', techName); // Сохраняем в браузер

    const buttons = document.querySelectorAll('#tech-filters .btn');
    buttons.forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');

    if (typeof loadTasks === 'function') {
        loadTasks();
    }
};

function initFilters() {
    const allUsers = CONFIG.USERS || [];
    
    // === НОВОЕ: УМНЫЙ ВЫБОР ФИЛЬТРА ПО УМОЛЧАНИЮ ===
    if (!window.activeTechFilter && currentUser) {
        let specialists = allUsers.filter(u => u.role === 'specialist');
        
        if (specialists.length > 0) {
            // Делаем ту же сортировку, что и для кнопок: сам юзер первый, остальные по алфавиту
            specialists.sort((a, b) => {
                if (a.name === currentUser.name) return -1;
                if (b.name === currentUser.name) return 1;
                return a.name.localeCompare(b.name);
            });
            window.activeTechFilter = specialists[0].name;
        }
        
        localStorage.setItem('activeTechFilter', window.activeTechFilter || '');
    }
    // ===============================================

    const hideDone = document.getElementById('hideDone');
    const onlyMyTasks = document.getElementById('onlyMyTasks');
    const dateRadios = document.querySelectorAll('input[name="filterDate"]');
    const customDate = document.getElementById('filterCustomDate');
    const taskSearch = document.getElementById('taskSearch');

    initTableTabs(); 

    if (!hideDone) return;

    hideDone.checked = localStorage.getItem('hideDone') === 'true';
    if (onlyMyTasks) {
        onlyMyTasks.checked = localStorage.getItem('onlyMyTasks') === 'true';
        onlyMyTasksFilter = onlyMyTasks.checked; // Синхронизируем переменную
    }
    const savedDateFilter = localStorage.getItem('dateFilter') || 'all';
    const activeRadio = document.querySelector(`input[name="filterDate"][value="${savedDateFilter}"]`);
    if (activeRadio) activeRadio.checked = true;

    hideDone.addEventListener('change', () => {
        localStorage.setItem('hideDone', hideDone.checked);
        loadTasks();
    });

    dateRadios.forEach(r => r.addEventListener('change', (e) => {
        localStorage.setItem('dateFilter', e.target.value);
        if (customDate) {
            if (customDate._flatpickr) {
                customDate._flatpickr.clear(false); // Очищаем без триггера onChange
            } else {
                customDate.value = '';
            }
        }
        localStorage.removeItem('customDateVal');
        loadTasks();
    }));

    if (customDate) {
        flatpickr(customDate, {
            locale: "ru",
            dateFormat: "Y-m-d",
            altInput: true,
            altFormat: "d.m.Y",
            allowInput: true, // Разрешаем ввод руками с клавиатуры
            altInputClass: "filter-segment-date", // МАГИЯ: принудительно заставляем его быть круглым!
            onChange: function(selectedDates, dateStr) {
                if (dateStr) {
                    localStorage.setItem('dateFilter', 'custom');
                    localStorage.setItem('customDateVal', dateStr); // Сохраняем дату!
                    dateRadios.forEach(r => r.checked = false);
                    if (typeof loadTasks === 'function') loadTasks();
                }
            }
        });
        
        // Подтягиваем значение при загрузке страницы
        const savedVal = localStorage.getItem('customDateVal');
        if (savedVal && localStorage.getItem('dateFilter') === 'custom') {
            customDate._flatpickr.setDate(savedVal, false);
        }
    }

    if (taskSearch) {
        taskSearch.addEventListener('input', () => loadTasks());
    }
    if (onlyMyTasks) {
        onlyMyTasks.addEventListener('change', () => {
            onlyMyTasksFilter = onlyMyTasks.checked;
            localStorage.setItem('onlyMyTasks', onlyMyTasks.checked);
            loadTasks(); // Перезагружаем таблицу с новым фильтром
        });
    }
}


function setupInterface() {
    if (!currentUser) return;
    
    const userInfo = document.getElementById('user-info');
    const adminLink = document.getElementById('admin-link');
    const reportsLink = document.getElementById('reports-link');
    const addTaskContainer = document.getElementById('add-task-btn-container'); 
    const busyBtn = document.getElementById('busy-task-btn');
    const techContainer = document.getElementById('tech-filters-container');
    const techFilters = document.getElementById('tech-filters');
    const onlyMyTasksContainer = document.getElementById('only-my-tasks-container');

    if (userInfo) userInfo.innerText = currentUser.name;

    // Ссылка на админку (только для роли admin)
    if (adminLink) {
        if (currentUser.role === 'admin') {
            adminLink.classList.remove('d-none'); 
            adminLink.href = 'admin/admin.html'; 
        } else {
            adminLink.classList.add('d-none'); 
        }
    }

    if (reportsLink) {
        if (currentUser.role !== 'manager') reportsLink.classList.remove('d-none');
        else reportsLink.classList.add('d-none');
    }

    // --- ЛОГИКА КНОПОК ДЕЙСТВИЙ ---

    // 1. КНОПКА "НОВАЯ ЗАДАЧА" (Видна всем, КРОМЕ тех.спецов)
    if (addTaskContainer) {
        if (currentUser.role === 'specialist') {
            addTaskContainer.style.setProperty('display', 'none', 'important');
        } else {
            addTaskContainer.style.setProperty('display', 'inline-block', 'important');
        }
    }

    // 2. КНОПКА "ЗАНЯТЬ ВРЕМЯ" (Видна всем, КРОМЕ менеджеров и руководителей (director))
    if (busyBtn) {
        if (currentUser.role === 'manager' || currentUser.role === 'director') {
            busyBtn.style.setProperty('display', 'none', 'important');
        } else {
            busyBtn.classList.remove('d-none'); // Убираем на всякий случай
            busyBtn.style.setProperty('display', 'inline-block', 'important');
        }
    }

    // --- ДОПОЛНИТЕЛЬНЫЕ ЭЛЕМЕНТЫ ---

    // Скрываем чекбокс "Мои задачи" для технарей (они и так видят только себя через фильтр)
    if (onlyMyTasksContainer) {
        if (currentUser.role === 'specialist') {
            onlyMyTasksContainer.style.setProperty('display', 'none', 'important');
        } else {
            onlyMyTasksContainer.style.setProperty('display', 'inline-flex', 'important');
        }
    }

    // Отрисовка фильтров технарей в шапке
    if (techContainer && techFilters) {
        techContainer.classList.remove('d-none');
        techFilters.innerHTML = ''; 

        let specialists = (CONFIG.USERS || []).filter(u => u.role === 'specialist');
        
        // === НОВОЕ: СОРТИРОВКА (Сам технарь всегда первый) ===
        specialists.sort((a, b) => {
            if (a.name === currentUser.name) return -1; // Ставим себя наверх
            if (b.name === currentUser.name) return 1;
            return a.name.localeCompare(b.name); // Остальных по алфавиту
        });
        
        specialists.forEach(tech => {
            if (tech.name === currentUser.name && !activeTechFilter) {
                activeTechFilter = tech.name;
            }
            const isActive = tech.name === activeTechFilter;
            techFilters.insertAdjacentHTML('beforeend', 
                `<button type="button" class="btn btn-sm btn-outline-secondary ${isActive ? 'active' : ''}" 
                 onclick="setTechFilter('${tech.name}', this)">${tech.name}</button>`
            );
        });
        const flexContainer = techFilters.parentElement;
        flexContainer.classList.add('w-100');

        // Удаляем старую кнопку занятости (чтобы не плодить дубли при перерисовках)
        const existingBtn = document.getElementById('global-availability-btn');
        if (existingBtn) existingBtn.remove();

        // Добавляем красивую светлую кнопку справа
        flexContainer.insertAdjacentHTML('beforeend', `
            <button id="global-availability-btn" type="button" class="btn btn-sm border shadow-sm ms-auto d-flex align-items-center gap-2 text-dark" 
                    style="background-color: #ffffff; border-radius: 15px; font-weight: 600; transition: all 0.2s;" 
                    onmouseover="this.style.backgroundColor='#f1f3f5';" 
                    onmouseout="this.style.backgroundColor='#ffffff';"
                    onclick="openAvailabilityModal(true)">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" fill="currentColor" viewBox="0 0 16 16" style="margin-top: -1px;">
                    <path d="M3.5 0a.5.5 0 0 1 .5.5V1h8V.5a.5.5 0 0 1 1 0V1h1a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2h1V.5a.5.5 0 0 1 .5-.5M1 4v10a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V4z"/>
                    <path d="M11 6.5a.5.5 0 0 1 .5-.5h1a.5.5 0 0 1 .5.5v1a.5.5 0 0 1-.5.5h-1a.5.5 0 0 1-.5-.5v-1z"/>
                </svg>
                Занятость
            </button>
        `);
    }
}