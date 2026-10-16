/* Alaa Academy / Bimo — static starter. No private server required. */
(() => {
  const $ = (id) => document.getElementById(id);
  const SUBJECTS = [
    "اللغة الإنجليزية", "اللغة الإنجليزية - التمارين",
    "الأحياء", "الكيمياء", "الفيزياء", "الرياضيات"
  ];
  const state = {
    apiKey: "",
    model: "openai/gpt-4o-mini",
    messages: [],
    books: [],
    tracks: [],
    track: "",
    studyMode: "answer",
    busy: false,
    freeMessages: 0,
    subscriptionExpiresAt: 0,
    subscriptionStorageAvailable: true
  };
  const FREE_MESSAGE_LIMIT = 5;
  const SUBSCRIPTION_DURATION_MS = 30 * 24 * 60 * 60 * 1000;
  const SUBSCRIPTION_STORAGE_KEY = "bimo_subscription_state";
  const API_KEY_STORAGE_KEY = "bimo_openrouter_key";
  const MODEL_STORAGE_KEY = "bimo_model";
  const THEME_STORAGE_KEY = "bimo_theme";
  const TARGET_GRADE = "الصف الثاني الثانوي";
  let modelCatalogPromise = null;

  const subjectSelect = $("subject-select");
  const trackSelect = $("track-select");
  const bookSelect = $("book-select");
  const studyModeSelect = $("study-mode-select");

  function addOption(select, value, label) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    select.appendChild(option);
  }

  function setStatus(ready, label) {
    $("connection-label").textContent = label;
    const dot = document.querySelector(".top-tag .status-dot");
    dot.classList.toggle("ready", ready);
  }
  function applyTheme(theme, persist = true) {
    const selected = theme === "light-blue" ? "light-blue" : "dark-green";
    document.documentElement.dataset.theme = selected;
    const metaThemeColor = document.querySelector('meta[name="theme-color"]');
    metaThemeColor.content = selected === "light-blue" ? "#f4f8ff" : "#050907";
    document.querySelectorAll('input[name="bimo-theme"]').forEach((option) => {
      option.checked = option.value === selected;
      option.closest(".theme-option").classList.toggle("selected", option.checked);
    });
    if (persist) {
      try {
        localStorage.setItem(THEME_STORAGE_KEY, selected);
      } catch (error) {
        $("theme-status").textContent = "تم تطبيق الألوان لهذه الجلسة، لكن تعذر حفظ الاختيار محليًا.";
        return;
      }
    }
    $("theme-status").textContent = selected === "light-blue"
      ? "تم تفعيل الأبيض والأزرق النيون وحفظ الاختيار على هذا الجهاز."
      : "تم تفعيل الأسود والأخضر النيون وحفظ الاختيار على هذا الجهاز.";
  }
  try {
    applyTheme(localStorage.getItem(THEME_STORAGE_KEY) || "dark-green", false);
  } catch (error) {
    applyTheme("dark-green", false);
    $("theme-status").textContent = "تعذر قراءة سمة الألوان المحفوظة؛ يستخدم بيمو الألوان الافتراضية.";
  }
  document.querySelectorAll('input[name="bimo-theme"]').forEach((option) => {
    option.addEventListener("change", () => {
      if (option.checked) applyTheme(option.value);
    });
  });
  function showSubscription(message = "") {
    $("subscription-overlay").classList.remove("hidden");
    $("subscription-message").textContent = message;
    $("subscription-code").focus();
  }
  function persistSubscription() {
    try {
      localStorage.setItem(SUBSCRIPTION_STORAGE_KEY, JSON.stringify({
        freeMessages: state.freeMessages,
        expiresAt: state.subscriptionExpiresAt
      }));
      return true;
    } catch (error) {
      state.subscriptionStorageAvailable = false;
      showSubscription("تعذر حفظ حالة الاشتراك على هذا الجهاز. فعّل التخزين المحلي في المتصفح ثم أعد تحميل الصفحة.");
      $("subscription-form").querySelector("button").disabled = true;
      $("subscription-code").disabled = true;
      return false;
    }
  }
  function refreshSubscriptionGate() {
    if (!state.subscriptionStorageAvailable) {
      showSubscription("تعذر استخدام التخزين المحلي في المتصفح، لذلك لا يمكن التحقق من الاشتراك.");
      return true;
    }
    if (state.subscriptionExpiresAt && state.subscriptionExpiresAt <= Date.now()) {
      state.subscriptionExpiresAt = 0;
      state.freeMessages = FREE_MESSAGE_LIMIT;
      if (!persistSubscription()) return true;
    }
    const required = !state.subscriptionExpiresAt && state.freeMessages >= FREE_MESSAGE_LIMIT;
    if (required) showSubscription();
    return required;
  }
  function recordFreeMessage() {
    if (state.subscriptionExpiresAt > Date.now()) return true;
    state.freeMessages = Math.min(FREE_MESSAGE_LIMIT, state.freeMessages + 1);
    return persistSubscription();
  }
  function clearSavedApiKey() {
    localStorage.removeItem(API_KEY_STORAGE_KEY);
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    state.apiKey = "";
    $("api-key").value = "";
    setStatus(false, "المفتاح غير مضاف");
  }
  function showView(view) {
    document.querySelectorAll(".view").forEach((el) => el.classList.add("hidden"));
    $(`${view}-view`).classList.remove("hidden");
    document.querySelectorAll(".nav-item").forEach((el) => {
      el.classList.toggle("active", el.dataset.view === view);
    });
    if (view === "settings") $("api-key").value = state.apiKey;
  }
  function setStudyMode(mode) {
    state.studyMode = mode;
    studyModeSelect.value = mode;
    document.querySelectorAll("[data-mode]").forEach((card) => {
      card.classList.toggle("selected", card.dataset.mode === mode);
      card.setAttribute("aria-pressed", String(card.dataset.mode === mode));
    });
  }
  document.querySelectorAll(".nav-item").forEach((btn) => btn.addEventListener("click", () => showView(btn.dataset.view)));
  $("open-settings").addEventListener("click", () => showView("settings"));
  document.querySelectorAll("[data-go-chat]").forEach((btn) => btn.addEventListener("click", () => showView("chat")));

  function addMessage(role, content, extraClass = "") {
    $("welcome-panel").classList.add("hidden");
    const el = document.createElement("article");
    el.className = `message ${role} ${extraClass}`.trim();
    el.dir = "rtl";
    const label = document.createElement("div");
    label.className = "message-label";
    label.textContent = role === "user" ? "أنت" : "بيمو";
    const body = document.createElement("div");
    body.className = "message-content";
    body.dir = "rtl";
    appendMessageContent(body, content);
    el.append(label, body);
    $("conversation").appendChild(el);
    el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    return el;
  }
  function appendMessageContent(container, content) {
    const lines = String(content).split(/\r?\n/);
    lines.forEach((line, index) => {
      const trimmed = line.trim();
      const wrappedEquation = trimmed.match(/^(?:\$\$([\s\S]*)\$\$|\\\[([\s\S]*)\\\])$/);
      const labeledEquation = trimmed.match(/^(القانون|الصيغة|التعويض)\s*[:：]\s*(.+)$/u);
      const hasOperator = /[=≈≠≤≥+\-−×÷*/^_√∑∫]/.test(trimmed);
      const hasLatinOrNumber = /[A-Za-z\u0370-\u03FF0-9]/u.test(trimmed);
      const hasArabic = /[\u0600-\u06FF]/u.test(trimmed);
      const labeledFormula = labeledEquation &&
        /[=≈≠≤≥+\-−×÷*/^_√∑∫]/.test(labeledEquation[2]) &&
        /[A-Za-z\u0370-\u03FF0-9]/u.test(labeledEquation[2]);
      const isEquation = Boolean(wrappedEquation || labeledFormula ||
        (hasOperator && hasLatinOrNumber && !hasArabic));

      if (isEquation) {
        const row = document.createElement("div");
        row.className = "equation-row";
        row.dir = "ltr";
        const formula = document.createElement("bdi");
        formula.className = "equation";
        formula.dir = "ltr";
        const equationText = wrappedEquation
          ? wrappedEquation[1] ?? wrappedEquation[2]
          : labeledEquation
            ? labeledEquation[2]
            : trimmed;
        if (labeledEquation) {
          const label = document.createElement("span");
          label.className = "equation-label";
          label.dir = "rtl";
          label.textContent = `${labeledEquation[1]}:`;
          row.appendChild(label);
        }
        formula.textContent = equationText.trim();
        row.appendChild(formula);
        container.appendChild(row);
      } else {
        const paragraph = document.createElement("div");
        paragraph.className = "message-line";
        paragraph.dir = "rtl";
        paragraph.textContent = line;
        container.appendChild(paragraph);
      }
      if (index < lines.length - 1) {
        container.appendChild(document.createElement("br"));
      }
    });
  }
  function addSources(messageElement, sources) {
    if (!sources.length) return;
    const section = document.createElement("section");
    section.className = "message-sources";
    section.setAttribute("aria-label", "المراجع المستخدمة من الكتاب");
    const heading = document.createElement("p");
    heading.className = "message-source-title";
    heading.textContent = `المراجع المستخدمة من الكتاب (${sources.length})`;
    const list = document.createElement("ul");
    sources.forEach((source) => {
      const item = document.createElement("li");
      const title = document.createElement("strong");
      title.textContent = `${source.subject} — ${source.book}`;
      const metadata = document.createElement("span");
      const page = Number.isInteger(Number(source.page)) && Number(source.page) > 0
        ? `صفحة PDF ${source.page}`
        : "رقم الصفحة غير متوفر";
      metadata.textContent = `${source.grade}، ${source.track}، ${page}${source.lesson ? `، ${source.lesson}` : ""}`;
      item.append(title, metadata);
      list.appendChild(item);
    });
    section.append(heading, list);
    messageElement.appendChild(section);
  }
  function normalizeArabic(value) {
    return String(value || "")
      .toLowerCase()
      .normalize("NFKC")
      .replace(/[\u064B-\u065F\u0670\u0640\u200C\u200D]/g, "")
      .replace(/[أإآٱ]/g, "ا")
      .replace(/ى/g, "ي")
      .replace(/[ؤ]/g, "و")
      .replace(/[ئ]/g, "ي")
      .replace(/[^\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF\u0370-\u03FF\u1F00-\u1FFF A-Za-z0-9\s]+/gu, " ")
      .replace(/\s+/g, " ")
      .trim();
  }
  function getBookContext(track, subject, bookName, question) {
    const query = normalizeArabic(question);
    const stopWords = new Set([
      "من", "في", "على", "عن", "الى", "هذا", "هذه", "ذلك", "كيف", "ماذا",
      "اشرح", "شرح", "لي", "درس", "كتاب", "صفحه", "اريد", "ما", "هو", "هي",
      "لخص", "تلخيص", "ملخص", "استخرج", "اهم", "نقاط", "قوانين", "قانون",
      "تعريفات", "تعريف", "انشئ", "انشاء", "اختبرني", "اختبار", "اسئله",
      "اسئلة", "اجابات", "الاجابات", "تصحيح", "بطاقات", "تعليميه",
      "خريطه", "ذهنيه", "مفاهيم", "سوال", "سؤال", "التالي", "اعتمادا",
      "اعطني", "ساعدني", "خطوه", "خطوات", "بسيطه", "مبسط", "مبسطه",
      "صف", "الثاني", "الثانوي", "علمي", "ادبي", "الصف", "الماده", "المحدد",
      "المحدده", "الدرس", "فهمي", "الكتاب", "المختار",
      "باستخدام", "العلاقه", "التي", "اكتبها", "هنا", "احسب", "قيمة",
      "حساب", "بين", "معنى", "الرموز", "الوحدات", "التعويض", "ذراعها",
      "العمودي", "والقوة", "القوة", "للقوة",
      "explain", "explanation", "summarize", "summary", "quiz", "test",
      "flashcards", "mindmap", "map", "points", "definition", "definitions",
      "please", "help", "me", "this", "the", "a", "an", "and", "or", "for",
      "from", "in", "on", "of", "what", "how", "about", "create", "make"
    ]);
    const terms = [...new Set(query.split(/\s+/).filter((word) =>
      (word.length > 1 || /^[A-Za-z\u0370-\u03FF]$/u.test(word)) &&
      !/^\d+$/u.test(word) && !stopWords.has(word)
    ))];
    if (!terms.length || !track || !subject || !bookName) return { excerpts: [], sources: [] };
    const matches = [];
    for (const book of state.books) {
      if (book.grade !== TARGET_GRADE || book.track !== track ||
          book.subject !== subject || book.book !== bookName) continue;
      let matchedTerms = 0;
      let score = 0;
      for (const term of terms) {
        const frequency = book.termFrequency.get(term) || 0;
        if (frequency) {
          matchedTerms++;
          score += Math.min(5, frequency) * (term.length >= 5 ? 1.25 : 1);
        }
      }
      const minimumMatches = 1;
      if (matchedTerms >= minimumMatches) {
        matches.push({ book, score: score + matchedTerms / terms.length });
      }
    }
    matches.sort((a, b) => b.score - a.score || Number(a.book.page || 0) - Number(b.book.page || 0));
    const relevant = matches.slice(0, 5);
    return {
      sources: relevant.map(({ book }) => ({
        grade: book.grade,
        track: book.track,
        subject: book.subject,
        book: book.book,
        lesson: typeof book.lesson === "string" && !/^https?:\/\//i.test(book.lesson)
          ? book.lesson
          : "",
        page: book.page
      })),
      excerpts: relevant.map(({ book }, index) =>
        `[المصدر ${index + 1}]\nالصف: ${book.grade}\nالقسم: ${book.track}\nالمادة: ${book.subject}\nالكتاب: ${book.book}\nالعنوان المسجل: ${book.lesson || "غير محدد"}\nصفحة PDF: ${Number(book.page) > 0 ? book.page : "غير متوفرة"}\nالنص المستخرج:\n${book.text.slice(0, 1800)}`
      )
    };
  }
  async function loadBooks() {
    try {
      const response = await fetch("data/books/index.json", { cache: "no-store" });
      if (!response.ok) throw new Error(`تعذر تحميل فهرس الكتب (HTTP ${response.status}).`);
      const index = await response.json();
      const entries = Array.isArray(index) ? index : (index.books || []);
      state.books = entries
        .filter((item) => item && item.grade === TARGET_GRADE &&
          typeof item.track === "string" && typeof item.subject === "string" &&
          typeof item.book === "string" && typeof item.text === "string" && item.text.trim())
        .map((item) => {
          const normalizedText = normalizeArabic(item.text);
          return {
            ...item,
            subject: item.subject === "اللغة الإنجليزية" &&
              /تمارين|exercises?/i.test(item.book || "")
              ? "اللغة الإنجليزية - التمارين"
              : item.subject,
            termFrequency: normalizedText.split(/\s+/).reduce((frequency, term) => {
              if (term) frequency.set(term, (frequency.get(term) || 0) + 1);
              return frequency;
            }, new Map())
          };
        })
        .filter((item) => SUBJECTS.includes(item.subject));
      state.tracks = [...new Set(state.books.map((book) => book.track))];
      trackSelect.replaceChildren();
      if (state.tracks.length > 1) {
        addOption(trackSelect, "", "اختر القسم");
        state.tracks.forEach((track) => addOption(trackSelect, track, track));
        $("track-wrap").classList.remove("hidden");
      } else {
        state.track = state.tracks[0] || "";
        $("track-wrap").classList.add("hidden");
      }
      updateSelectors();
      if (state.books.length) {
        const bookCount = new Set(state.books.map((item) => `${item.subject}|${item.book}`)).size;
        $("book-status").textContent = `الصف الثاني الثانوي: ${bookCount} كتب و${state.books.length} مقطعًا مفهرسًا`;
        $("library-status").textContent = `${bookCount} كتب، ${state.books.length} مقطعًا نصيًا`;
        renderSubjects();
      } else {
        $("book-status").textContent = "لا توجد مقاطع مفهرسة لكتب الصف الثاني الثانوي.";
        $("library-status").textContent = "لا توجد كتب مفهرسة لهذا الصف.";
      }
    } catch (error) {
      $("book-status").textContent = "تعذر تحميل فهرس الكتب؛ لن تُرسل أسئلة بلا مصادر.";
      $("library-status").textContent = error.message || "تعذر تحميل فهرس الكتب.";
      console.error("تعذر تحميل فهرس كتب بيمو:", error);
    }
  }
  function updateSelectors() {
    const selectedSubject = subjectSelect.value;
    const selectedBook = bookSelect.value;
    const visibleBooks = state.books.filter((book) =>
      book.grade === TARGET_GRADE && (!state.track || book.track === state.track)
    );
    const subjects = [...new Set(visibleBooks.map((book) => book.subject))];
    subjectSelect.replaceChildren();
    addOption(subjectSelect, "", "اختر المادة");
    subjects.forEach((subject) => addOption(subjectSelect, subject, subject));
    if (subjects.includes(selectedSubject)) subjectSelect.value = selectedSubject;

    const books = visibleBooks.filter((book) => book.subject === subjectSelect.value);
    const bookNames = [...new Set(books.map((book) => book.book))];
    bookSelect.replaceChildren();
    addOption(bookSelect, "", bookNames.length > 1 ? "اختر الكتاب" : "لا يوجد كتاب");
    bookNames.forEach((name) => addOption(bookSelect, name, name));
    if (bookNames.includes(selectedBook)) bookSelect.value = selectedBook;
    else if (bookNames.length === 1) bookSelect.value = bookNames[0];
  }
  function renderSubjects() {
    const container = $("subjects-list");
    container.replaceChildren();
    if (!state.books.length) {
      const empty = document.createElement("p");
      empty.textContent = "لا توجد كتب مفهرسة للصف الثاني الثانوي.";
      container.appendChild(empty);
      return;
    }
    const catalog = new Map();
    state.books.forEach((book) => {
      const key = `${book.track}|${book.subject}|${book.book}`;
      catalog.set(key, { ...book, count: (catalog.get(key)?.count || 0) + 1 });
    });
    catalog.forEach(({ track, subject, book, count }) => {
      const card = document.createElement("button");
      card.className = "quick-card";
      card.style.width = "100%";
      card.style.textAlign = "right";
      const icon = document.createElement("span");
      icon.textContent = "▤";
      const title = document.createElement("strong");
      title.textContent = `${subject} — ${book}`;
      const detail = document.createElement("small");
      detail.textContent = `${TARGET_GRADE}، القسم ${track}، ${count} صفحة/مقطع`;
      card.append(icon, title, detail);
      card.addEventListener("click", () => {
        state.track = track;
        trackSelect.value = track;
        updateSelectors();
        subjectSelect.value = subject;
        updateSelectors();
        bookSelect.value = book;
        showView("chat");
      });
      container.appendChild(card);
    });
  }

  $("settings-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const enteredKey = $("api-key").value.trim();
    const model = $("model-select").value.trim() || "openai/gpt-4o-mini";
    try {
      localStorage.setItem(MODEL_STORAGE_KEY, model);
      if (enteredKey) localStorage.setItem(API_KEY_STORAGE_KEY, enteredKey);
    } catch (error) {
      $("settings-message").textContent = "تعذر حفظ الإعدادات على هذا الجهاز. تحقق من إعدادات التخزين في المتصفح.";
      return;
    }
    if (enteredKey) state.apiKey = enteredKey;
    state.model = model;
    setStatus(Boolean(state.apiKey), state.apiKey ? "المفتاح محفوظ على هذا الجهاز" : "المفتاح غير مضاف");
    $("api-key").value = "";
    $("settings-message").textContent = state.apiKey
      ? `تم حفظ الإعدادات محليًا. النموذج ${state.model}؛ أدخل مفتاحًا جديدًا لتغييره، أو احذفه بالزر أدناه.`
      : "حُفظ النموذج محليًا. أدخل مفتاح OpenRouter لحفظه قبل إرسال الطلبات.";
  });
  $("clear-key").addEventListener("click", () => {
    try {
      clearSavedApiKey();
      $("settings-message").textContent = "تم حذف مفتاح OpenRouter من التخزين المحلي.";
    } catch (error) {
      $("settings-message").textContent = `تعذر حذف المفتاح من التخزين المحلي: ${error.message}`;
    }
  });
  $("toggle-key").addEventListener("click", () => {
    const input = $("api-key");
    input.type = input.type === "password" ? "text" : "password";
    $("toggle-key").textContent = input.type === "password" ? "إظهار" : "إخفاء";
    $("toggle-key").setAttribute("aria-pressed", String(input.type === "text"));
  });

  $("subscription-code").addEventListener("input", (event) => {
    event.target.value = event.target.value
      .replace(/[\u0660-\u0669]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
      .replace(/[\u06F0-\u06F9]/g, (digit) => String(digit.charCodeAt(0) - 0x06F0))
      .replace(/\D/g, "")
      .slice(0, 5);
  });
  $("subscription-form").addEventListener("submit", (event) => {
    event.preventDefault();
    const code = $("subscription-code").value;
    if (!/^\d{5}$/.test(code) || code[2] !== "8") {
      $("subscription-message").textContent = "الرمز غير صحيح. أدخل خمسة أرقام، ويجب أن يكون الرقم الثالث 8.";
      $("subscription-code").focus();
      return;
    }
    state.freeMessages = 0;
    state.subscriptionExpiresAt = Date.now() + SUBSCRIPTION_DURATION_MS;
    if (!persistSubscription()) return;
    $("subscription-overlay").classList.add("hidden");
    $("subscription-code").value = "";
    $("subscription-message").textContent = "";
    addMessage("assistant", "تم تفعيل الاشتراك لمدة 30 يومًا. يمكنك متابعة التعلّم الآن.");
  });

  const MODE_INSTRUCTIONS = {
    explain: "اشرح الدرس خطوة بخطوة بعربية واضحة مناسبة للصف الثاني الثانوي، وعرّف المصطلحات واربط الشرح بأمثلة من المصدر. لا تضف حقائق منهجية غير موجودة في المقاطع.",
    summarize: "لخّص محتوى المقاطع فقط، ثم استخرج أهم النقاط والقوانين والتعريفات الواردة فيها. ميّز بين القانون والتعريف، ولا تخترع أيًا منها.",
    quiz: "أنشئ اختبارًا قصيرًا متنوعًا من محتوى المقاطع فقط. أدرج نموذج الإجابة ومفتاح التصحيح والدرجة المقترحة بوضوح، وميّز مفتاح الإجابات عن الأسئلة.",
    flashcards: "أنشئ بطاقات تعليمية للحفظ من المقاطع فقط، بصيغة سؤال/وجه أمامي ثم جواب/وجه خلفي، مع تغطية المفاهيم والتعريفات والقوانين الموجودة.",
    mindmap: "أنشئ خريطة ذهنية نصية متدرجة (عنوان رئيسي ثم فروع ونقاط فرعية) لمفاهيم المقاطع فقط، وأظهر الروابط بينها دون إضافة مفاهيم غير موثقة.",
    answer: "أجب عن سؤال الطالب بالاستناد إلى المقاطع فقط. إن لم تجب المقاطع عنه بوضوح، فقل إن المصادر المتاحة لا تكفي ولا تخمّن."
  };
  const SCIENCE_EXPLANATION_INSTRUCTIONS = `تعليمات ثابتة لكل الردود:
- اللغة الافتراضية هي العربية الواضحة المناسبة لطلاب ${TARGET_GRADE} في اليمن. اكتب العناوين والتعليقات وشرح الخطوات بالعربية؛ يُسمح بالرموز الرياضية والفيزيائية والكيميائية كما هي في المصدر.
- عند تناول قانون أو معادلة في الرياضيات أو الفيزياء أو الكيمياء، اعتمد أولًا على المقاطع المسترجعة من الكتاب المحدد. انقل الصيغة والرموز والوحدات وشروط الاستخدام كما تظهر في المقطع، ولا تستبدل رمزًا لاتينيًا مثل F أو r أو θ أو تغيّر اصطلاح الكتاب.
- عرّف كل رمز بالعربية، واذكر وحدة القياس وطريقة التعويض فقط إذا دعمها نص الكتاب أو بيانات المسألة. لا تخترع وحدة أو قيمة أو شرطًا. ميّز بوضوح بين ما يقوله المصدر وما يقدمه الطالب.
- قد تكون OCR المقاطع المصورة مشوهة: إذا لم تستطع قراءة الصيغة أو الرمز أو الوحدة بثقة من النص المسترجع، فلا تستنتج القانون من معرفتك ولا تنسبه إلى الكتاب. قل إن صيغة القانون غير واضحة في النسخة المفهرسة واطلب صورة/نصًا أوضح، ولا تدّعِ أن صفحات المراجع تثبت صيغة غير ظاهرة فيها.
- إذا زوّد الطالب القانون صراحةً في سؤاله وكانت المسألة محددة، فيجوز حل الحساب وفق الصيغة التي كتبها الطالب، مع توضيح أنها صيغة السؤال لا صيغة تحققت نسبتها إلى الكتاب؛ لا تصادق على نسبتها للكتاب دون نص واضح.
- اعرض كل معادلة على سطر مستقل محاط بعلامتي $$، وبالصيغة النصية الواضحة ورموز المصدر نفسها؛ لا تضع شرحًا عربيًا داخل سطر المعادلة. ستعرضها الواجهة في كتلة معزولة من اليسار إلى اليمين، بينما يبقى النص عربيًا من اليمين إلى اليسار. لا تستخدم HTML أو كتل شيفرة.
- في المسألة الحسابية رتّب الرد بالعربية تحت العناوين: المعطيات، المطلوب، القانون، التعويض، خطوات الحساب، النتيجة النهائية ووحدتها. لا تملأ أي قسم بافتراضات؛ إذا غاب القانون أو المعطى الضروري في المصادر أو السؤال، فصرّح بالنقص واطلبه.
- لا تخترع قانونًا أو تعريفًا أو اقتباسًا أو رقم صفحة. لا تقل إن صيغة ما وردت في الكتاب إلا إذا كان نصها مقروءًا فعلًا في المقاطع المرسلة.`;

  async function validateTextModel(model) {
    if (!model || !/^[\w.-]+\/[\w.:-]+$/.test(model)) {
      throw new Error("اسم النموذج غير مكتمل. أدخل معرّفًا بصيغة provider/model من OpenRouter.");
    }
    if (!modelCatalogPromise) {
      modelCatalogPromise = (async () => {
        const controller = new AbortController();
        const timeout = window.setTimeout(() => controller.abort(), 20_000);
        try {
          const response = await fetch("https://openrouter.ai/api/v1/models", {
            headers: { "Accept": "application/json" },
            signal: controller.signal
          });
          if (!response.ok) throw new Error(`تعذر التحقق من النماذج (HTTP ${response.status}).`);
          const catalog = await response.json();
          if (!Array.isArray(catalog.data)) throw new Error("لم يرسل OpenRouter قائمة نماذج صالحة.");
          return new Map(catalog.data.map((entry) => [entry.id, entry]));
        } catch (error) {
          modelCatalogPromise = null;
          if (error.name === "AbortError") throw new Error("انتهت مهلة التحقق من النموذج؛ تحقق من اتصال الإنترنت.");
          if (error instanceof TypeError) throw new Error("تعذر الاتصال بقائمة نماذج OpenRouter؛ تحقق من الإنترنت أو إعدادات الشبكة.");
          throw error;
        } finally {
          window.clearTimeout(timeout);
        }
      })();
    }
    const catalog = await modelCatalogPromise;
    const selected = catalog.get(model);
    if (!selected) throw new Error(`النموذج «${model}» غير موجود في قائمة OpenRouter الحالية.`);
    const inputModalities = selected.architecture?.input_modalities || [];
    const outputModalities = selected.architecture?.output_modalities || [];
    if (!inputModalities.includes("text") || !outputModalities.includes("text")) {
      throw new Error(`النموذج «${model}» لا يدعم الإدخال والإخراج النصي المطلوبين للدردشة.`);
    }
  }

  function requestErrorMessage(status, detail) {
    const messages = {
      400: "رفض OpenRouter الطلب أو إعداد النموذج.",
      401: "مفتاح OpenRouter غير صالح أو مرفوض.",
      402: "رصيد الحساب أو حد الإنفاق في OpenRouter غير كافٍ.",
      403: "ليس لهذا المفتاح صلاحية استخدام النموذج أو الخدمة.",
      404: "لم يعثر OpenRouter على النموذج أو نقطة الخدمة المطلوبة.",
      408: "انتهت مهلة الطلب إلى OpenRouter.",
      429: "تم تجاوز حد الاستخدام؛ انتظر قليلًا أو تحقق من حدود حساب OpenRouter."
    };
    return `${messages[status] || (status >= 500 ? "خدمة OpenRouter تواجه مشكلة مؤقتة." : `فشل الطلب (HTTP ${status}).`)}${detail ? `\nالتفاصيل: ${detail}` : ""}`;
  }

  async function sendMessage(message) {
    const subject = subjectSelect.value;
    const track = state.track;
    const bookName = bookSelect.value;
    const lesson = $("lesson-input").value.trim();
    if (!message.trim() || state.busy) return;
    if (refreshSubscriptionGate()) return;
    if (!track) {
      addMessage("assistant", "اختر القسم الدراسي أولًا لعرض الكتب المتاحة.");
      return;
    }
    if (!subject || !bookName) {
      addMessage("assistant", "اختر المادة والكتاب أولًا حتى أبحث في مصدره الصحيح.");
      return;
    }
    if (!state.apiKey) {
      addMessage("assistant", "لم يُحفظ مفتاح OpenRouter بعد. أضف مفتاحك الشخصي من الإعدادات؛ لا ترسله إلى المطور أو تضعه في ملفات المشروع.", "error");
      return;
    }
    const bookContext = getBookContext(track, subject, bookName, `${lesson} ${message}`);
    if (!bookContext.sources.length) {
      addMessage("user", message);
      addMessage("assistant", "لم أجد في الكتاب المحدد مقاطع تطابق موضوع السؤال بدرجة كافية، لذلك لم أرسل السؤال إلى النموذج ولم أنسب إجابة إلى الكتاب. اكتب اسم الدرس أو مصطلحًا من الصفحة، وتأكد من اختيار الكتاب الصحيح.", "error");
      $("message-input").value = "";
      return;
    }
    const isFreeMessage = state.subscriptionExpiresAt <= Date.now();
    if (isFreeMessage && !recordFreeMessage()) return;
    const subscriptionRequiredAfterReply = isFreeMessage && state.freeMessages >= FREE_MESSAGE_LIMIT;
    addMessage("user", message);
    $("message-input").value = "";
    state.messages.push({ role: "user", content: message });
    state.busy = true;
    $("send-button").disabled = true;
    const pending = addMessage("assistant", "أراجع سؤالك وأجهز الإجابة...");
    const systemPrompt = `أنت بيمو، مساعد دراسي لطلاب ${TARGET_GRADE} في العلاء أكاديمي.
${SCIENCE_EXPLANATION_INSTRUCTIONS}
نفّذ المهمة التالية: ${MODE_INSTRUCTIONS[state.studyMode] || MODE_INSTRUCTIONS.answer}
المادة: ${subject}. الكتاب المحدد: ${bookName}. القسم: ${track}. الدرس الذي أدخله الطالب: ${lesson || "لم يحدد"}.
استخدم النصوص المصدرية أدناه وحدها لإثبات المعلومات المنسوبة إلى الكتاب. لا تختلق مصادر أو اقتباسات أو صفحات، ولا تخلط بين المواد أو الكتب. إذا كان النص المستخرج مشوهًا أو لا يكفي للإجابة، صرّح بذلك بوضوح ولا تخمّن. يمكنك توضيح المصطلحات بأمثلة حياتية لكن ميّزها عن معلومات الكتاب. ستظهر مراجع المقاطع الفعلية للطالب منفصلة عن إجابتك؛ لا تنشئ أرقام صفحات أو مراجع من عندك.
المقاطع المسترجعة فعليًا من الكتاب المحدد:
${bookContext.excerpts.join("\n\n---\n\n")}`;
    let requestTimeout = null;
    try {
      await validateTextModel(state.model);
      const controller = new AbortController();
      requestTimeout = window.setTimeout(() => controller.abort(), 60_000);
      const response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${state.apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": location.href,
          "X-Title": "Alaa Academy - Bimo"
        },
        body: JSON.stringify({
          model: state.model,
          messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: `المهمة: ${MODE_INSTRUCTIONS[state.studyMode] || MODE_INSTRUCTIONS.answer}\nسؤال الطالب: ${message}` }
          ]
        }),
        signal: controller.signal
      });
      window.clearTimeout(requestTimeout);
      requestTimeout = null;
      let data;
      try {
        data = await response.json();
      } catch (error) {
        if (response.ok) throw new Error("أعاد OpenRouter استجابة غير مفهومة بدل إجابة نصية.");
        data = {};
      }
      if (!response.ok) {
        if (response.status === 401) {
          try {
            clearSavedApiKey();
            $("settings-message").textContent = "رفض OpenRouter المفتاح؛ تمت إزالته من هذا الجهاز. أدخل مفتاحًا صالحًا.";
          } catch (error) {
            state.apiKey = "";
            setStatus(false, "مفتاح OpenRouter غير صالح");
          }
        }
        throw new Error(requestErrorMessage(response.status, data?.error?.message));
      }
      const answer = data?.choices?.[0]?.message?.content;
      if (typeof answer !== "string" || !answer.trim()) throw new Error("لم يصل رد نصي من النموذج.");
      const answerBody = pending.querySelector(".message-content");
      answerBody.replaceChildren();
      appendMessageContent(answerBody, answer.trim());
      addSources(pending, bookContext.sources);
      state.messages.push({ role: "assistant", content: answer });
    } catch (error) {
      pending.classList.add("error");
      const detail = error.name === "AbortError"
        ? "انتهت مهلة الاتصال. تحقق من الإنترنت وحاول مجددًا."
        : error instanceof TypeError
          ? "تعذر الاتصال بخدمة OpenRouter. تحقق من الإنترنت أو إعدادات الاتصال وحاول مجددًا."
        : error.message;
      pending.querySelector("div:last-child").textContent = `تعذر الحصول على إجابة.\n${detail}`;
    } finally {
      if (requestTimeout !== null) window.clearTimeout(requestTimeout);
      state.busy = false;
      $("send-button").disabled = false;
      if (subscriptionRequiredAfterReply) showSubscription();
    }
  }
  $("chat-form").addEventListener("submit", (event) => {
    event.preventDefault();
    sendMessage($("message-input").value);
  });
  trackSelect.addEventListener("change", () => {
    state.track = trackSelect.value;
    updateSelectors();
  });
  subjectSelect.addEventListener("change", updateSelectors);
  studyModeSelect.addEventListener("change", () => setStudyMode(studyModeSelect.value));
  document.querySelectorAll("[data-prompt]").forEach((button) => {
    button.addEventListener("click", () => {
      setStudyMode(button.dataset.mode || "answer");
      $("message-input").value = button.dataset.prompt;
      $("message-input").focus();
      showView("chat");
    });
  });
  $("message-input").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      $("chat-form").requestSubmit();
    }
  });

  let installPrompt = null;
  const installButton = $("install-app");
  const installStatus = $("install-status");
  const isInstalled = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
  const isIOS = /iphone|ipad|ipod/i.test(window.navigator.userAgent) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);

  if (isInstalled) {
    installButton.classList.add("hidden");
  } else if (isIOS) {
    installButton.textContent = "طريقة التثبيت";
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    installPrompt = event;
    installButton.textContent = "تثبيت التطبيق";
    installButton.classList.remove("hidden");
  });

  installButton.addEventListener("click", async () => {
    if (!installPrompt) {
      installStatus.textContent = isIOS
        ? "افتح قائمة المشاركة في Safari ثم اختر «إضافة إلى الشاشة الرئيسية»."
        : "من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».";
      installStatus.classList.remove("hidden");
      return;
    }

    installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    installPrompt = null;
    if (choice.outcome === "accepted") {
      installButton.classList.add("hidden");
      installStatus.textContent = "تم بدء تثبيت بيمو على جهازك.";
      installStatus.classList.remove("hidden");
    }
  });

  window.addEventListener("appinstalled", () => {
    installButton.classList.add("hidden");
    installStatus.textContent = "تم تثبيت بيمو بنجاح.";
    installStatus.classList.remove("hidden");
  });

  if ("serviceWorker" in navigator && (location.protocol === "https:" || location.hostname === "localhost")) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("تعذر تفعيل دعم العمل دون اتصال:", error);
    });
  }

  try {
    const savedApiKey = localStorage.getItem(API_KEY_STORAGE_KEY);
    const legacyApiKey = sessionStorage.getItem(API_KEY_STORAGE_KEY) || "";
    state.apiKey = savedApiKey || legacyApiKey;
    if (!savedApiKey && legacyApiKey) localStorage.setItem(API_KEY_STORAGE_KEY, legacyApiKey);
    sessionStorage.removeItem(API_KEY_STORAGE_KEY);
    state.model = localStorage.getItem(MODEL_STORAGE_KEY) || sessionStorage.getItem(MODEL_STORAGE_KEY) || "openai/gpt-4o-mini";
    if (!localStorage.getItem(MODEL_STORAGE_KEY)) localStorage.setItem(MODEL_STORAGE_KEY, state.model);
    sessionStorage.removeItem(MODEL_STORAGE_KEY);
  } catch (error) {
    state.apiKey = "";
    $("settings-message").textContent = "تعذر قراءة المفتاح المحفوظ. تحقق من إعدادات التخزين في المتصفح.";
  }
  try {
    const savedSubscription = localStorage.getItem(SUBSCRIPTION_STORAGE_KEY);
    if (savedSubscription) {
      const subscription = JSON.parse(savedSubscription);
      if (!Number.isInteger(subscription.freeMessages) ||
          subscription.freeMessages < 0 ||
          subscription.freeMessages > FREE_MESSAGE_LIMIT ||
          !Number.isFinite(subscription.expiresAt) ||
          subscription.expiresAt < 0) {
        throw new Error("بيانات الاشتراك المحفوظة غير صالحة.");
      }
      state.freeMessages = subscription.freeMessages;
      state.subscriptionExpiresAt = subscription.expiresAt;
    }
  } catch (error) {
    state.subscriptionStorageAvailable = false;
  }
  $("api-key").value = state.apiKey;
  $("model-select").value = state.model;
  setStatus(Boolean(state.apiKey), state.apiKey ? "المفتاح محفوظ على هذا الجهاز" : "المفتاح غير مضاف");
  refreshSubscriptionGate();
  window.setInterval(refreshSubscriptionGate, 60_000);
  loadBooks();
})();
