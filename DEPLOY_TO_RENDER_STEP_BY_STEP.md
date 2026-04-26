# Как выложить игру бесплатно на Render

Эта инструкция без сложных слов. Нужно один раз выложить проект на GitHub, потом подключить его к Render.

## 1. Создай репозиторий на GitHub

1. Открой https://github.com/new
2. В поле Repository name напиши:

```text
billiards
```

3. Выбери Public.
4. Не ставь галочки `Add a README`, `.gitignore`, `license`.
5. Нажми `Create repository`.

GitHub покажет страницу с командами. Тебе нужна строка вида:

```text
https://github.com/ТВОЙ_ЛОГИН/billiards.git
```

Скопируй её.

## 2. Отправь проект на GitHub

Открой PowerShell в папке проекта:

```powershell
cd C:\Users\lmmsf\Documents\billiards
```

Выполни команды, заменив ссылку на свою:

```powershell
git remote add origin https://github.com/ТВОЙ_ЛОГИН/billiards.git
git branch -M main
git push -u origin main
```

Если GitHub попросит войти, войди в браузере или через окно авторизации.

## 3. Создай сайт на Render

1. Открой https://render.com
2. Войди через GitHub.
3. Нажми `New`.
4. Выбери `Blueprint`.
5. Выбери репозиторий `billiards`.
6. Render сам увидит файл `render.yaml`.
7. Нажми `Apply` или `Create`.
8. Дождись, пока статус станет `Live`.

После этого Render даст ссылку вида:

```text
https://lan-8-ball-pool.onrender.com
```

Её можно отправлять друзьям. Radmin и VPN больше не нужны.

## Если Render просит настроить вручную

Выбери `New -> Web Service`, репозиторий `billiards`, и укажи:

```text
Build Command: npm install --include=dev && npm run build
Start Command: npm start
Plan: Free
```

## Важно

На бесплатном тарифе Render сайт может засыпать после простоя. Если первый вход долго грузится, подожди примерно минуту и обнови страницу.

Комнаты хранятся в памяти. Если Render перезапустит сервер, нужно создать комнату заново.
