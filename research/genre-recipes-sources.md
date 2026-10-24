# Рецепты жанров: источники

Данные лежат в `research/genre-recipes.json`. Собрано 2026-10-24.

Как устроен файл:
- `conventions` — единицы измерения, кривая сложности, общие правила juice и честности, типичные ошибки ИИ-генерации для всех жанров.
- `genres` — 15 рецептов. У каждого есть поле `genre` из нашего списка arcade, match3, runner, quiz, clicker, puzzle, other.

Метки в тексте рецептов:
- `[S:ключ]` — число или правило взято из источника с этим ключом (раздел 2).
- `[H]` — наша оценка (эвристика). Её нужно подстроить по статистике игр.

Если у пункта стоят обе метки, правило из источника, а конкретное число наше.

«Проверено» значит, что цифру прочитали в самом источнике: в коде, слайдах, тексте или субтитрах. «Не проверено» значит, что цифра найдена только в поисковой выдаче; такие цифры в рецептах помечены `[H]` или не используются.

## 1. Как подставлять в промпт

- Единицы: `W = GG.W` и `H = GG.H`. В `phaser-kit.js` канвас 720×1280, это вдвое больше логической сетки 360×640. Скорости заданы в H/с, размеры — в долях W, поэтому рецепты не зависят от разрешения.
- Минимальная цель для тапа в пикселях канваса = `profile.minTapTargetPx × GG.W / 360`. Профили — в `audience-profiles.json`.
- Эффекты указаны через готовые функции рантайма: `GG.fx.burst`, `float`, `hit`, `shake`, `flash`, `banner`, `pop`, `squash`, а также `GG.sfx(...)` и `GG.vibrate(...)`. Их параметры уже ограничены в `phaser-kit.js`: длительность hitstop 60 мс, не больше одной вспышки за 3 с, половинная тряска для детей и пожилых.
- Весь файл занимает около 43 КБ. В промпт стоит подставлять `conventions` и один рецепт выбранного жанра, примерно 3 КБ. Метки `[S:]` и `[H]` можно вырезать регуляркой `/\s*\[(S:[a-z0-9-]+|H)\]/g`.

**Кривая сложности.** У Kenta Cho формула `sqrt(кадры × 0.0001) + 1` при 60 fps. В секундах это `d(t) = 1 + sqrt(t / 167)`: 1.42 на 30-й секунде, 1.6 на 60-й, 2.04 на 180-й. Автор исходит из того, что большинство игроков бросает игру, когда сложность доходит примерно до 2×. Пилообразный спад после каждой волны взят по образцу Missile Command.

## 2. Источники по ключам

### Juice и ощущение игры

| Ключ | Источник | Что взято | Статус |
|---|---|---|---|
| juicy-breakout | Jonasson & Purho, «Juice it or lose it», Nordic Game Indie Night 2012. Код: https://github.com/grapefrukt/juicy-breakout, видео: https://www.youtube.com/watch?v=Fy0aCDmgnxg | Порядок эффектов: цвет → появление с easing → растяжение ракетки и мяча → «желе» → звук и музыка → частицы и разрушение → шлейф → тряска → глаза. Константы, 60 fps: появление 0.7 с с y = −500, ±45° и scale 0.2; ракетка `scaleX = 1 + |dx|/100`, `scaleY = 1.5 − scaleX·0.5`; мяч +0.3 / −0.2 по скорости; кирпич 1.2 за 0.05 с, назад с Elastic за 0.6 с; частицы 5 при ударе и 20 конфетти у ракетки; шлейф 30 сегментов; пружинная тряска −v×0.5. Freeze в демо по умолчанию 0 | проверено (код, субтитры) |
| nijman | Jan Willem Nijman (Vlambeer), «The Art of Screenshake», INDIGO 2013. https://www.youtube.com/watch?v=AJdEqssNZ-U | Крупные пули, вспышка на первом кадре пули, отдача «на пару пикселей», «постоянство» (обломки остаются), sleep «примерно 20 мс» при попадании, 33% врагов взрываются, отдача камеры против выстрела, замедление до 10 fps в кульминации; от тряски тошнило, понадобилась опция её выключить | проверено (субтитры; 20 мс — оценка самого автора) |
| eiserloh | Squirrel Eiserloh, «Juicing Your Cameras With Math», GDC 2016. https://media.gdcvault.com/gdc2016/Presentations/Eiserloh_Squirrel_JuicingYourCameras.pdf | Тряска = trauma² или trauma³, где trauma от 0 до 1 растёт на +0.2…0.5 за событие и линейно затухает; шум Перлина; следование камеры `x += (target − x)·k` с k = 0.1 («быстро») при 60 fps. Конкретных амплитуд в px нет | проверено |
| swink | Steve Swink, «Game Feel», Morgan Kaufmann 2009, с. 36, 43, 44, 301 | 50 мс воспринимается как мгновенно, больше 100 мс задержка заметна, 200 мс — вязко; цикл коррекции 240 мс; видимый результат в пределах 70–100 мс после ввода | проверено (текст книги) |
| celeste | Maddy Thorson, «Celeste & Forgiveness», https://www.mattmakesgames.com/articles/celeste_and_forgiveness/index.html; исходник https://github.com/NoelFB/Celeste/blob/master/Source/Player/Player.cs | coyote time `JumpGraceTime = 0.1` с, freeze 0.05 с на dash, коррекция углов 4 px. Длительность jump buffer в опубликованном коде отсутствует | проверено |
| pittman | Kyle Pittman, «Building a Better Jump», GDC 2016. https://media.gdcvault.com/gdc2016/Presentations/Pittman_Kyle_BuildingBetterJump.pdf | v₀ = 2h/tₕ, g = 2h/tₕ², где h — высота вершины, tₕ — время до неё | проверено |
| hicks | Hicks et al., «Juicy Game Design», CHI PLAY 2019. https://doi.org/10.1145/3311350.3347171 | Juice повышает привлекательность и погружение, но не результат игрока (N = 40 и N = 32); тряска мешала части игроков | проверено |
| kao | Kao, «The effects of juiciness in an action RPG», Entertainment Computing 34, 2020. DOI 10.1016/j.entcom.2020.100359 | N = 3018; уровни None и Extreme хуже Medium и High по времени игры, опыту и мотивации | проверено (абстракт) |
| haptics | Android Haptics principles: https://developer.android.com/develop/ui/views/haptics/haptics-principles, https://developer.android.com/develop/ui/views/haptics/custom-haptic-effects; Apple HIG Playing haptics; MDN `navigator.vibrate`: https://developer.mozilla.org/en-US/docs/Web/API/Navigator/vibrate | Клик 10–20 мс; пауза ≥ 50 мс, чтобы её почувствовать; не больше 3 уровней силы с шагом ≥ 1.4×; «less is more»; вибрация опциональна (Apple). Vibration API имеет ограниченную поддержку и требует жеста пользователя (MDN). В Safari на iOS её нет: страница MDN без таблицы совместимости это прямо не показала | проверено, кроме строки про iOS |

### Сложность и прогрессия

| Ключ | Источник | Что взято | Статус |
|---|---|---|---|
| cho | Kenta Cho (ABA Games), «Rising Difficulty Curve». https://abagames.github.io/joys-of-small-game-development-en/difficulty/curve.html | Формула `sqrt(кадры × 0.0001) + 1`, игроки бросают примерно на 2×, вариант «пила» | проверено (авторство страницы определено по сайту) |
| missile | Andy McFadden, Missile Command wave guide (ROM). https://www.6502disassembly.com/va-missile-command/wave-guide.html | Ракет в волне: 12, 15, 18, 12, 16, 14, 17, 10… — пилообразный рост; интервал движения ракет 4.81 → 0 кадров к 15-й волне | проверено |
| breakout | Wikipedia, Breakout (Atari 1976). https://en.wikipedia.org/wiki/Breakout_(video_game) | Ускорение мяча после 4 и 12 ударов и при касании оранжевого и красного рядов; ракетка сжимается вдвое после удара в верхнюю стену; 8 рядов по 14 кирпичей, очки 1/3/5/7; 3 мяча | проверено |
| arkanoid | StrategyWiki, Arkanoid. https://strategywiki.org/wiki/Arkanoid/Gameplay | Капсула выпадает после случайного числа кирпичей, одновременно падает только одна; эффекты Laser, Enlarge, Catch, Slow, Break, Disruption (3 мяча, пока их больше одного, капсулы не падают), Player; серебряные и золотые кирпичи | проверено (точной частоты нет) |
| invaders | Computer Archeology, дизассемблер Space Invaders. https://www.computerarcheology.com/Arcade/SpaceInvaders/Code.html | За кадр двигается один пришелец, поэтому строй ускоряется, когда их остаётся меньше; интервал выстрелов 48 → 16 → 11 → 8 → 7 кадров по мере роста счёта | проверено |
| tetris | TetrisWiki: https://tetris.wiki/Random_Generator, https://tetris.wiki/Tetris_(NES,_Nintendo) | 7-bag: перемешанный мешок из 7 фигур, между двумя одинаковыми не больше 12; скорость падения NES от 48 до 1 кадра на ряд | проверено |
| duckhunt | StrategyWiki, Duck Hunt. https://strategywiki.org/wiki/Duck_Hunt | 10 уток за раунд; для перехода нужно 6 в раундах 1–10, затем 7, 8, 9, 10; очки растут с раундом (500 → 800 → 1000) | проверено |
| fruitninja | Fruit Ninja Wiki (Classic, Arcade, Zen, Bombs): https://fruitninja.fandom.com/wiki/Arcade_Mode; Luke Muscat, GDC 2012: https://media.gdcvault.com/gdc2012/slides/Summit_Smartphone%20%26%20Tablet/Muscat_Luke_IteratingDesignAnd.pdf; интервью: https://ramine.net/writing/fruit-ninja-design | Arcade 60 с; бананы Frenzy, Freeze, Double ≈ 7 с; Zen 90 с без бомб; Classic: 3 промаха, +1 жизнь за 100 очков; примерно 1 бомба на 6 фруктов; волны настроены под комбо; хитбокс фрукта больше видимого, бомбы — меньше | проверено (вики-данные помечены как вики) |
| doodle | PocketGamer.biz 2009: https://www.pocketgamer.biz/bouncing-ever-upwards-the-making-of-doodle-jump/; Doodle Jump Wiki: https://doodle-jump.fandom.com/wiki/Spring | Правило «одно новое препятствие на один новый бонус»; движущиеся платформы ускоряются с высотой; пружина ≈ 352 очка высоты, джетпак ≈ 3000. Зависимости промежутков от высоты в источниках нет | проверено |
| flappy | Isaksen, Gopstein, Togelius, Nealen, FDG 2015: https://www.nealen.net/papers/exploring-game-space-FDG2015.pdf; IEEE ToG 2018: https://www.nealen.net/papers/08030128.pdf | Задержка реакции человека τ = 288 мс, СКО ошибки тайминга 36–61 мс; в оригинальной Flappy Bird нет нарастания сложности | проверено |
| canabalt | Adam Saltsman, «Tuning Canabalt», 2010. https://www.gamedeveloper.com/design/tuning-canabalt | Хитбокс игрока 12×14 при спрайте 24×24; самый большой разрыв ≈ ⅔ возможностей на текущей скорости; особое событие раз в 3–8 зданий | проверено |
| stack | dinogame.gg, «Mastering Stack». https://dinogame.gg/blog/mastering-stack/ | Около 8 идеальных падений подряд — и блок отрастает; допуск «крошечный». Первоисточника Ketchapp нет | не проверено; все числа в рецепте `[H]` |
| angrybirds | PocketGamer 2011, интервью с Arttu Mäki (Rovio). https://www.pocketgamer.com/angry-birds/exclusive-the-making-of-an-angry-birds-level/ | Сначала выбирают «горсть птиц», потом строят уровень; пороги звёзд — среднее по 5–10 тестерам; на рейтинги уходит больше времени, чем на постройку | проверено |
| pvz | George Fan, GDC 2012. Слайды: https://media.gdcvault.com/gdc2012/slides/Design%20Track/Fan_George_How%20I%20Got.pdf, конспект: https://www.gamedeveloper.com/design/gdc-2012-10-tutorial-tips-from-i-plants-vs-zombies-i-creator-george-fan; волны: https://plantsvszombies.fandom.com/wiki/Level_1-1 | Обучение через действие; не больше 8 слов на экране; механики вводятся постепенно; волны 1-1: 1, 1, 1, 2, 2, 2, 3, 3, 3, затем огромная волна из 9 зомби с флагом | проверено |
| bloons | Bloons Wiki, Late Game (BTD6). https://bloons.fandom.com/wiki/Late_Game_and_Freeplay_(BTD6) | Скорость шаров `1 + 0.02(r − 80)` на раундах 81–100, то есть +2% за раунд | проверено (страница помечена как устаревшая) |
| snake | Nokia blog 2009: https://blogs.windows.com/devices/2009/01/20/history-of-nokia-part-2-snake/; интервью с Taneli Armanto: https://melmagazine.com/en-us/story/snake-nokia-6110-oral-history-taneli-armanto; Google Snake Wiki: https://google-snake.fandom.com/wiki/Map_Sizes | Уровни скорости отличаются только паузой между шагами; несколько миллисекунд форы перед гибелью; стандартная карта Google 15×17 | проверено; «+1 сегмент за еду» не подтверждено |
| juul | Jesper Juul, «Fear of Failing?», 2009. https://www.jesperjuul.net/text/fearoffailing/ | Выше всех игру оценили те, кто терял жизни, но дошёл до конца (n = 85) | проверено |

### Головоломки, викторины и кликеры

| Ключ | Источник | Что взято | Статус |
|---|---|---|---|
| bejeweled | Bejeweled Wiki: https://bejeweled.wiki.gg/wiki/Bejeweled_Blitz, …/Power_Gem, …/Cube; Wikipedia, Bejeweled Blitz | Blitz: поле 8×8, раунд 60 с; 7 цветов; 4 в ряд → Power Gem (очищает 3×3); 5 в ряд → Hypercube (все камни цвета); бонус за 3 совпадения за 3 с; Last Hurrah в конце; без ходов — перемешивание (Timed) | проверено |
| king-patent | Патенты King US9345965B2 (https://patents.google.com/patent/US9345965B2/en) и US20140370950A1 (https://patents.google.com/patent/US20140370950A1/en) | Поле не больше 9×9, 6 цветов; 4 в ряд → полосатая (ряд или столбец); L/T → обёрнутая (3×3); 5 → цветная бомба; при отсутствии ходов — перемешивание без готовых троек, «всегда есть хотя бы один ход»; подсказка «после нескольких секунд бездействия»; лимит ходов; «+5» секунд в уровнях на время | проверено |
| king-gdc | Jeremy Kang (King), «Level Design Saga», GDC Europe 2016. https://media.gdcvault.com/gdceurope2016/presentations/KANG_Jeremy_LevelDesignSaga.pdf; Candy Crush Wiki, Colours | Рычаги сложности: цели, ходы, пороги звёзд, число цветов, блокеры. Уровень 65 после перехода с 6 на 5 цветов стал из «почти невозможного» средним | проверено |
| cowan | Cowan 2001, BBS 24(1), PMID 11515286 | Рабочая память ≈ 4 блока (3–5) | проверено |
| riggs | Riggs et al. 2006, J Exp Child Psychol 95(1), PMID 16678845 | Зрительная рабочая память удваивается между 5 и 10 годами и выходит на взрослые 3–4 объекта | проверено |
| cowan2006 | Cowan et al. 2006, Dev Psychol, PMID 17087544 | У людей 65–85 лет есть дополнительный дефицит связывания «объект ↔ место» — ровно то, что требует мемори | проверено |
| kahoot | Kahoot Help, «How points work» (архив). https://web.archive.org/web/2025id_/https://support.kahoot.com/hc/en-us/articles/115002303908-How-points-work | `очки = round(1000 × (1 − (время / таймер) / 2))`; таймер от 5 с до 4 мин. Значение по умолчанию 20 с не подтверждено | проверено |
| hq | Inside Edition 2018: https://www.insideedition.com/video-shows-woman-going-berserk-after-winning-11-trivia-game-craze-39728; Wikipedia, HQ Trivia | 12 вопросов от лёгких к трудным, 10 с на ответ, 3 варианта, дополнительные жизни | проверено |
| quizup | Обзор Pub Quiz Postmortem, 2014. https://pubquizpostmortem.blogspot.com/2014/01/review-quizup-app.html | 7 вопросов по 10 с; очки = 10 + оставшиеся секунды; последний вопрос ×2 | проверено (сторонний обзор) |
| millionaire | Wikipedia, Who Wants to Be a Millionaire? | 15 вопросов с ростом сложности; подсказки 50:50, звонок другу, помощь зала | проверено |
| cookie | Cookie Clicker Wiki, Buildings. https://cookieclicker.wiki.gg/wiki/Buildings | Цена = ⌈база × 1.15^куплено⌉; базовые цены 15, 100, 1100, 12000, 130000 | проверено |
| cookie-onboarding | teemo.dev, «Onboarding and first session». https://teemo.dev/game-design/cookie-clicker/systems/onboarding-and-first-session/ | Первая покупка через 5–10 с, первый выбор через 40–90 с | низкое доверие (наблюдение без автора) |
| adcap | AdVenture Capitalist Wiki, Businesses (архив). https://web.archive.org/web/2025id_/https://adventure-capitalist.fandom.com/wiki/Businesses | Коэффициенты роста цены от 1.07 до 1.15; цикл бизнеса ускоряется вдвое на 25, 50, 100… штуках | проверено |
| pecorella | Anthony Pecorella (Kongregate), «The Math of Idle Games» I и III, 2016–2017. https://www.gamedeveloper.com/design/the-math-of-idle-games-part-i | Цена = база × rate^owned, производство линейно по числу; ×2 на 25 и 50; формулы престижа | проверено |

### Честность, Phaser и ошибки ИИ-генерации

| Ключ | Источник | Что взято | Статус |
|---|---|---|---|
| opengame | Jiang et al., «OpenGame: Open Agentic Coding for Games», 2026. https://arxiv.org/html/2604.18394 | Бенчмарк на Phaser 3. Типы ошибок: логическая несогласованность (игра зависает, не заканчивается, механики не работают), незнание движка, рассогласование ключей ассетов и порядка инициализации; «тихие» ошибки правил в три-в-ряд. Intent Alignment: платформеры 76.8, головоломки и UI 52.6; даже лучшая система оставляет 34.9% требований невыполненными | проверено |
| factorsim | Sun et al., FactorSim, NeurIPS 2024. https://arxiv.org/html/2409.17652v2 | Ошибки в логике столкновений; «mode collapse» к знакомой игре; сброс позиции раньше проверки столкновений; GPT-4 с первой попытки проходит 35% тестов Flappy и 42% Snake | проверено |
| phaser | Документация Phaser: https://docs.phaser.io/phaser/concepts/physics/arcade, …/concepts/scenes, …/concepts/gameobjects/group, …/concepts/input, …/concepts/audio; issue https://github.com/phaserjs/phaser/issues/1424 | В Arcade нет непрерывной проверки столкновений: шаг за кадр должен быть меньше половины препятствия; только прямоугольники и круги (`setSize`, `setCircle`); при restart сцена переиспользуется, поэтому состояние сбрасывают в `init`/`create`; пул объектов требует `disableBody`; `pointerdown` вместо `click`; `pixelPerfect` дорогой; звук разблокируется только после жеста. Сайт уже показывает API Phaser 4.1; концепции те же, сигнатуры сверять с 3.90 | проверено |
| igarashi | Koji Igarashi в статье Kevin McVay, 2020. https://www.gamedeveloper.com/design/tips-for-beginner-game-developers-from-koji-igarashi-daisuke-amaya-takumi-naramura | Хитбокс игрока небольшой, хитбоксы бонусов большие | проверено |
| spelunky | Darius Kazemi, Spelunky Generator Lessons. https://tinysubversions.com/spelunkyGen/ | Сначала строится гарантированный путь от входа к выходу, потом расставляются опасности | проверено |
| stout | Mike Stout, «Enemy Attacks and Telegraphing», 2015. https://www.gamedeveloper.com/design/enemy-attacks-and-telegraphing | Перед атакой нужна небольшая задержка-предупреждение, «тогда это честно». Длительностей нет; 0.5 с в рецептах — `[H]` | проверено |

## 3. Что остаётся эвристикой

- **Почти все конкретные скорости в H/с и W/с, интервалы спавна, длительности бонусов (кроме ≈7 с у Fruit Ninja) и размеры полей.** Это наши оценки, привязанные к кривой Cho и правилам из источников. Их надо подстроить по статистике сыгранных игр.
- **Stack (Ketchapp).** Первоисточника нет; допуск и рост скорости — `[H]`.
- **3 полосы в раннере.** Это устоявшаяся конвенция жанра, первоисточник не найден. Данные о скорости Subway Surfers есть только в Reddit, который не открылся.
- **Размеры поля в мемори по уровням сложности.** Авторитетного источника нет. Число пар выведено из ёмкости рабочей памяти (Cowan, Riggs) и помечено `[H]`.
- **Амплитуда тряски в пикселях.** Ни один источник её не даёт. Поэтому используется `GG.fx.shake` с уже ограниченными уровнями из `phaser-kit.js`.
- **«Научить за 3 секунды» для гиперказуалок.** Первичного источника для геймплея нет: найденные утверждения касаются рекламных роликов. В рецептах это `[H]`.
