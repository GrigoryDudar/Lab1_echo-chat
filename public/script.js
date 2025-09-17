// Глобальні змінні
let ws;
let username;
let contextMenu;

// DOM елементи
const loginScreen = document.getElementById('login-screen');
const chatScreen = document.getElementById('chat-screen');
const usernameInput = document.getElementById('username-input');
const loginButton = document.getElementById('login-button');
const userList = document.getElementById('user-list');
const messagesContainer = document.getElementById('messages');
const messageInput = document.getElementById('message-input');
const sendButton = document.getElementById('send-button');

// Ініціалізація
function init() {
    // Створення контекстного меню
    createContextMenu();
    
    // Обробники подій
    loginButton.addEventListener('click', login);
    sendButton.addEventListener('click', sendMessage);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') sendMessage();
    });
    
    // Початковий фокус на поле введення імені
    usernameInput.focus();
}

// Створення контекстного меню
function createContextMenu() {
    contextMenu = document.createElement('div');
    contextMenu.className = 'context-menu';
    
    const menuList = document.createElement('ul');
    const banItem = document.createElement('li');
    banItem.textContent = 'Заблокувати';
    banItem.id = 'ban-user';
    
    menuList.appendChild(banItem);
    contextMenu.appendChild(menuList);
    document.body.appendChild(contextMenu);
    
    // Закриття контекстного меню при кліку в інше місце
    document.addEventListener('click', () => {
        contextMenu.style.display = 'none';
    });
}

// Підключення до WebSocket сервера
function connectWebSocket() {
    // Визначення URL сервера
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}`;
    
    // Створення WebSocket з'єднання
    ws = new WebSocket(wsUrl);
    
    // Обробники подій WebSocket
    ws.onopen = () => {
        console.log('З\'єднання встановлено');
        
        // Відправка логіну
        ws.send(JSON.stringify({
            type: 'login',
            username: username
        }));
    };
    
    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        handleMessage(data);
    };
    
    ws.onclose = () => {
        console.log('З\'єднання закрито');
        
        // Повернення до екрану входу, якщо з'єднання закрито
        showLoginScreen();
    };
    
    ws.onerror = (error) => {
        console.error('WebSocket помилка:', error);
    };
}

// Обробка повідомлень від сервера
function handleMessage(data) {
    switch (data.type) {
        case 'login':
            if (data.success) {
                showChatScreen();
            }
            break;
            
        case 'message':
            displayMessage(data);
            break;
            
        case 'notification':
            displayNotification(data.message);
            break;
            
        case 'userList':
            updateUserList(data.users);
            break;
            
        case 'banned':
            alert(data.message);
            showLoginScreen();
            break;
            
        case 'error':
            alert(data.message);
            break;
            
        case 'serverLink':
            displayServerLink(data.url, data.message);
            break;
    }
}

// Функція входу
function login() {
    username = usernameInput.value.trim();
    
    if (username) {
        connectWebSocket();
    } else {
        alert('Будь ласка, введіть нікнейм');
    }
}

// Відображення екрану чату
function showChatScreen() {
    loginScreen.classList.remove('active');
    chatScreen.classList.add('active');
    messageInput.focus();
}

// Відображення екрану входу
function showLoginScreen() {
    chatScreen.classList.remove('active');
    loginScreen.classList.add('active');
    usernameInput.focus();
}

// Відправка повідомлення
function sendMessage() {
    const text = messageInput.value.trim();
    
    if (text && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'message',
            text: text,
            timestamp: new Date().toISOString()
        }));
        
        messageInput.value = '';
    }
}

// Відображення повідомлення в чаті
function displayMessage(data) {
    const messageElement = document.createElement('div');
    messageElement.className = 'message';
    
    // Форматування часових міток
    const sentTime = new Date(data.sentTimestamp).toLocaleTimeString();
    const receivedTime = new Date(data.receivedTimestamp).toLocaleTimeString();
    
    messageElement.innerHTML = `
        <div class="header">
            <span class="username">${data.username}</span>
            <span class="timestamp">Відправлено: ${sentTime} | Отримано: ${receivedTime}</span>
        </div>
        <div class="text">${data.text}</div>
    `;
    
    messagesContainer.appendChild(messageElement);
    
    // Прокрутка до останнього повідомлення
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Відображення сповіщення в чаті
function displayNotification(message) {
    const notificationElement = document.createElement('div');
    notificationElement.className = 'notification';
    notificationElement.textContent = message;
    
    messagesContainer.appendChild(notificationElement);
    
    // Прокрутка до останнього повідомлення
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Оновлення списку користувачів
function updateUserList(users) {
    userList.innerHTML = '';
    
    users.forEach(user => {
        const listItem = document.createElement('li');
        listItem.textContent = user;
        listItem.dataset.username = user;
        
        // Додавання контекстного меню при правому кліку
        listItem.addEventListener('contextmenu', (e) => {
            e.preventDefault();
            
            // Не показувати контекстне меню для власного імені
            if (user === username) return;
            
            // Позиціонування контекстного меню
            contextMenu.style.display = 'block';
            contextMenu.style.left = `${e.pageX}px`;
            contextMenu.style.top = `${e.pageY}px`;
            
            // Додавання обробника для блокування користувача
            const banButton = document.getElementById('ban-user');
            banButton.onclick = () => {
                banUser(user);
                contextMenu.style.display = 'none';
            };
        });
        
        userList.appendChild(listItem);
    });
}

// Блокування користувача
function banUser(userToBan) {
    if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({
            type: 'ban',
            username: userToBan
        }));
    }
}

// Запуск скрипта при завантаженні сторінки
window.addEventListener('load', init);