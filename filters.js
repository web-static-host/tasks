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
        // Здесь можно тоже хранить значение даты в кэше, если нужно
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
    if (!window.activeTechFilter && CONFIG.USERS && CONFIG.USERS.length > 0) {
    const firstTech = CONFIG.USERS.find(u => u.role === 'specialist');
    if (firstTech) window.activeTechFilter = firstTech.name;
    }
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
        customDate.value = ''; 
        loadTasks();
    }));

    customDate.addEventListener('change', () => {
        if (customDate.value) {
            localStorage.setItem('dateFilter', 'custom');
            dateRadios.forEach(r => r.checked = false);
            loadTasks();
        }
    });

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
            onlyMyTasksContainer.style.setProperty('display', 'inline-block', 'important');
        }
    }

    // Отрисовка фильтров технарей в шапке
    if (techContainer && techFilters) {
        techContainer.classList.remove('d-none');
        techFilters.innerHTML = ''; 

        const specialists = (CONFIG.USERS || []).filter(u => u.role === 'specialist');
        
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
    }
}