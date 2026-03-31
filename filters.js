// --- 1. ИНИЦИАЛИЗАЦИЯ (с памятью и выбором первого) ---
const firstTechInConfig = CONFIG.USERS.find(u => u.role === 'specialist')?.name || '';
// Пытаемся взять из памяти, если там пусто — берем первого из списка
let activeTechFilter = localStorage.getItem('activeTechFilter') || firstTechInConfig;

let currentTable = 'tasks'; 
let onlyMyTasksFilter = false;

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
    activeTechFilter = techName;
    localStorage.setItem('activeTechFilter', techName); // Сохраняем в браузер

    const buttons = document.querySelectorAll('#tech-filters .btn');
    buttons.forEach(b => b.classList.remove('active'));
    if (btn) btn.classList.add('active');



    loadTasks();
};

function initFilters() {
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
    const userInfo = document.getElementById('user-info');
    const thRole = document.getElementById('th-user-role');
    const addBtn = document.getElementById('add-task-btn');
    const busyBtn = document.getElementById('busy-task-btn');
    const techContainer = document.getElementById('tech-filters-container');
    const techFilters = document.getElementById('tech-filters');

    if (userInfo) {
        userInfo.innerText = `${currentUser.name} (${currentUser.role === 'manager' ? 'Менеджер' : 'Технарь'})`;
    }

    // --- КНОПКИ ДЕЙСТВИЙ ---
    if (currentUser.role === 'specialist') {
        if (addBtn) addBtn.style.display = 'none';
        if (busyBtn) {
            busyBtn.classList.remove('d-none');
            busyBtn.style.display = 'block';
        }
    } else {
        if (addBtn) addBtn.style.display = 'block';
        if (busyBtn) {
            busyBtn.classList.add('d-none');
            busyBtn.style.display = 'none';
        }
    }

    // --- СКРЫВАЕМ "МОИ ЗАДАЧИ" ДЛЯ ТЕХНАРЯ (ЖЕСТКИЙ ВАРИАНТ) ---
const onlyMyTasksContainer = document.getElementById('only-my-tasks-container');
if (onlyMyTasksContainer) {
    if (currentUser.role === 'specialist') {
        onlyMyTasksContainer.classList.add('d-none'); // Добавляем класс Бутстрапа для скрытия
        onlyMyTasksContainer.style.setProperty('display', 'none', 'important'); // Вбиваем гвоздь
    } else {
        onlyMyTasksContainer.classList.remove('d-none');
        onlyMyTasksContainer.style.display = 'inline-block';
    }
}

    // --- ФИЛЬТРЫ ТЕХНАРЕЙ (для всех ролей) ---
    if (techContainer && techFilters) {
        techContainer.classList.remove('d-none'); // Показываем всем
        techFilters.innerHTML = ''; // Очищаем


        // Рендерим список технарей из конфига
        CONFIG.USERS.filter(u => u.role === 'specialist').forEach(tech => {
            // Если технарь зашел под собой, кнопка с его именем будет активна по умолчанию
            const isMe = (tech.name === currentUser.name && activeTechFilter === 'all');
            const isActive = tech.name === activeTechFilter || isMe;
            
            // Если технарь зашел первый раз, фиксируем его имя в фильтре
            if (isMe && currentUser.role === 'specialist') activeTechFilter = tech.name;

            techFilters.insertAdjacentHTML('beforeend', 
                `<button type="button" class="btn btn-sm btn-outline-secondary ${isActive ? 'active' : ''}" onclick="setTechFilter('${tech.name}', this)">${tech.name}</button>`
            );
        });
    }
}