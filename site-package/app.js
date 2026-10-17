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
    activeQuiz: null,
    conversationContext: "",
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
  const SEARCH_SYNONYMS = new Map([
    ["مقبض", ["ذراع", "عزم"]],
    ["المقبض", ["ذراع", "عزم"]],
    ["مفصلة", ["محور", "دوران", "عزم"]],
    ["المفصلة", ["محور", "دوران", "عزم"]],
    ["باب", ["مقبض", "عزم", "ذراع"]],
    ["الباب", ["مقبض", "عزم", "ذراع"]],
    ["دوران", ["عزم", "محور"]],
    ["التسارع", ["تعجيل"]],
    ["تسارع", ["تعجيل"]],
    ["التعجيل", ["تسارع"]],
    ["تعجيل", ["تسارع"]]
  ]);
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
    closeMobileMenu();
  }
  function closeMobileMenu() {
    const menu = $("mobile-menu");
    menu.classList.add("hidden");
    $("mobile-menu-backdrop").classList.add("hidden");
    menu.setAttribute("aria-hidden", "true");
    $("mobile-menu-toggle").setAttribute("aria-expanded", "false");
    $("mobile-menu-toggle").setAttribute("aria-label", "فتح القائمة");
  }
  function toggleMobileMenu() {
    const menu = $("mobile-menu");
    const isOpen = menu.classList.contains("hidden");
    menu.classList.toggle("hidden", !isOpen);
    $("mobile-menu-backdrop").classList.toggle("hidden", !isOpen);
    menu.setAttribute("aria-hidden", String(!isOpen));
    $("mobile-menu-toggle").setAttribute("aria-expanded", String(isOpen));
    $("mobile-menu-toggle").setAttribute("aria-label", isOpen ? "إغلاق القائمة" : "فتح القائمة");
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
  $("mobile-menu-toggle").addEventListener("click", toggleMobileMenu);
  $("mobile-menu-backdrop").addEventListener("click", closeMobileMenu);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closeMobileMenu();
  });
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
    for (let index = 0; index < lines.length; index++) {
      const line = lines[index];
      const trimmed = line.trim();
      if (trimmed.startsWith("```")) {
        const codeLines = [];
        while (++index < lines.length && lines[index].trim() !== "```") {
          codeLines.push(lines[index]);
        }
        const pre = document.createElement("pre");
        pre.className = "message-code-block";
        const code = document.createElement("code");
        code.dir = "ltr";
        code.textContent = codeLines.join("\n");
        pre.appendChild(code);
        container.appendChild(pre);
        continue;
      }
      let wrappedEquation = trimmed.match(/^(?:\$\$([\s\S]*)\$\$|\\\[([\s\S]*)\\\])$/);
      if (!wrappedEquation && (trimmed === "$$" || trimmed === "\\[")) {
        const closingMarker = trimmed === "$$" ? "$$" : "\\]";
        const equationLines = [];
        while (++index < lines.length && lines[index].trim() !== closingMarker) {
          equationLines.push(lines[index]);
        }
        wrappedEquation = [trimmed, equationLines.join("\n"), undefined];
      }
      const labeledEquation = trimmed.match(/^(القانون|الصيغة|التعويض)\s*[:：]\s*(.+)$/u);
      const heading = line.match(/^\s{0,3}(#{1,3})\s+(.+)$/);
      const bullet = line.match(/^\s*[-*]\s+(.+)$/);
      const numbered = line.match(/^\s*\d+[.)]\s+(.+)$/);
      const formulaCandidate = trimmed.replace(/\*\*|__/g, "");
      const hasOperator = /[=≈≠≤≥+\-−×÷*/^_√∑∫]/.test(formulaCandidate);
      const hasLatinOrNumber = /[A-Za-z\u0370-\u03FF0-9]/u.test(formulaCandidate);
      const hasArabic = /[\u0600-\u06FF]/u.test(formulaCandidate);
      const arabicWords = [...formulaCandidate.matchAll(/[\u0600-\u06FF]{2,}/gu)];
      const labeledFormula = labeledEquation && /[=≈≠≤≥+\-−×÷*/^_√∑∫]/.test(labeledEquation[2]);
      const isEquation = Boolean(wrappedEquation || labeledFormula ||
        (!heading && !bullet && !numbered && !/^\s*\*\*[^*]+\*\*\s*$/u.test(trimmed) &&
          hasOperator && (hasLatinOrNumber || (hasArabic && arabicWords.length <= 3))));

      if (isEquation) {
        const row = document.createElement("div");
        row.className = "equation-row";
        row.dir = "ltr";
        const formula = document.createElement("bdi");
        formula.className = "equation";
        formula.dir = "ltr";
        const equationText = wrappedEquation
          ? wrappedEquation[1] ?? wrappedEquation[2] ?? ""
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
        const paragraph = document.createElement(heading ? `h${heading[1].length + 2}` : "div");
        paragraph.className = heading ? "message-heading" : bullet || numbered ? "message-list-item" : "message-line";
        paragraph.dir = "rtl";
        appendInlineFormatting(paragraph, heading?.[2] || bullet?.[1] || numbered?.[1] || line);
        container.appendChild(paragraph);
      }
    }
  }
  function appendInlineFormatting(container, text) {
    const fragments = String(text).split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
    fragments.forEach((fragment) => {
      if (fragment.startsWith("**") && fragment.endsWith("**")) {
        const strong = document.createElement("strong");
        strong.textContent = fragment.slice(2, -2);
        container.appendChild(strong);
      } else if (fragment.startsWith("`") && fragment.endsWith("`")) {
        const code = document.createElement("code");
        code.dir = "ltr";
        code.textContent = fragment.slice(1, -1);
        container.appendChild(code);
      } else {
        container.appendChild(document.createTextNode(fragment));
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
      metadata.textContent = `${source.grade}، ${source.track}${source.lesson ? `، ${source.lesson}` : ""}، ${page}`;
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
      "حساب", "بين", "معنى", "الرموز", "الوحدات", "التعويض",
      "explain", "explanation", "summarize", "summary", "quiz", "test",
      "flashcards", "mindmap", "map", "points", "definition", "definitions",
      "please", "help", "me", "this", "the", "a", "an", "and", "or", "for",
      "from", "in", "on", "of", "what", "how", "about", "create", "make"
    ].map(normalizeArabic));
    const terms = [...new Set(query.split(/\s+/).filter((word) =>
      (word.length > 1 || /^[A-Za-z\u0370-\u03FF]$/u.test(word)) &&
      !/^\d+$/u.test(word) && !stopWords.has(word)
    ))];
    if (!track || !subject || !bookName) return { excerpts: [], sources: [], matched: false };
    const matches = [];
    for (const book of state.books) {
      if (book.grade !== TARGET_GRADE || book.track !== track ||
          book.subject !== subject || book.book !== bookName) continue;
      let matchedTerms = 0;
      let score = 0;
      const lessonText = normalizeArabic(book.lesson || "");
      const lessonTerms = new Set(lessonText.split(/\s+/));
      for (const term of terms) {
        const relatedTerms = SEARCH_SYNONYMS.get(term) || [];
        const candidates = [term, ...relatedTerms];
        const frequency = candidates.reduce((sum, candidate) =>
          sum + (book.termFrequency.get(candidate) || 0), 0);
        const lessonMatch = candidates.some((candidate) => lessonTerms.has(candidate));
        const semanticMatch = relatedTerms.some((candidate) =>
          book.termFrequency.has(candidate) || lessonTerms.has(candidate));
        if (frequency || lessonMatch) {
          matchedTerms++;
          score += Math.min(5, frequency) * (term.length >= 5 ? 1.25 : 1) +
            (lessonMatch ? 3 : 0) + (semanticMatch ? 0.8 : 0);
        }
      }
      matches.push({
        book,
        matchedTerms,
        score: score + (terms.length ? matchedTerms / terms.length : 0) +
          (book.verified ? 2.5 : 0) + (lessonText && query.includes(lessonText) ? 10 : 0)
      });
    }
    matches.sort((a, b) => b.score - a.score || Number(a.book.page || 0) - Number(b.book.page || 0));
    const relevantMatches = matches.filter(({ matchedTerms }) => matchedTerms > 0);
    const relevant = (relevantMatches.length ? relevantMatches : matches).slice(0, 3);
    return {
      matched: relevantMatches.length > 0,
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
        `[مقطع ${index + 1}]\nالصف: ${book.grade}\nالقسم: ${book.track}\nالمادة: ${book.subject}\nالكتاب: ${book.book}\nالدرس المسجل: ${book.lesson || "غير محدد"}\nصفحة PDF: ${Number(book.page) > 0 ? book.page : "غير متوفرة"}\n${book.verified ? "النص المدقق بمقابلته مع PDF الأصلي" : "النص المستخرج"}:\n${book.text.slice(0, 1800)}`
      )
    };
  }
  async function loadBooks() {
    try {
      const [response, verifiedResponse] = await Promise.all([
        fetch("data/books/index.json", { cache: "no-store" }),
        fetch("data/books/verified-excerpts.json", { cache: "no-store" })
      ]);
      if (!response.ok) throw new Error(`تعذر تحميل فهرس الكتب (HTTP ${response.status}).`);
      if (!verifiedResponse.ok) throw new Error(`تعذر تحميل المقاطع المدققة (HTTP ${verifiedResponse.status}).`);
      const index = await response.json();
      const verifiedIndex = await verifiedResponse.json();
      const entries = [
        ...(Array.isArray(index) ? index : (index.books || [])),
        ...(Array.isArray(verifiedIndex) ? verifiedIndex : (verifiedIndex.books || []))
      ];
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
    explain: "اشرح ما طلبه الطالب خطوة بخطوة بلغة عربية واضحة مناسبة للصف الثاني الثانوي في اليمن، ثم أعط مثالًا محلولًا مناسبًا. عند شرح قانون عرّف رموزه واشرح متى يستخدم.",
    summarize: "قدّم ملخصًا منظمًا للدرس بعناوين ونقاط، مع أهم الأفكار والتعريفات والقوانين ذات الصلة.",
    quiz: "أجر اختبارًا تفاعليًا من سؤال واحد في كل رسالة، وانتظر إجابة الطالب قبل المتابعة. لا تعرض الإجابة الصحيحة قبل أن يجيب. بعد كل إجابة صححها واشرح السبب ثم اطرح السؤال التالي.",
    quizAnswer: "قيّم إجابة الطالب عن آخر سؤال طرحته: اذكر بوضوح إن كانت صحيحة أو جزئية أو خاطئة، ثم اشرح الإجابة الصحيحة وسببها. بعد ذلك اطرح سؤالًا جديدًا واحدًا فقط من الدرس نفسه ولا تعرض إجابته، ثم انتظر رد الطالب.",
    flashcards: "قدّم بطاقات مراجعة مناسبة للمستوى، كل بطاقة بسؤال واضح ثم إجابة موجزة.",
    mindmap: "أنشئ خريطة ذهنية نصية منظمة بعنوان رئيسي وفروع ونقاط فرعية توضّح العلاقات بين الأفكار.",
    answer: "أجب عن سؤال الطالب مباشرةً أولًا، ثم اشرح بإيجاز سبب الإجابة وطريقة الوصول إليها."
  };
  function classifyRequest(message) {
    const normalized = normalizeArabic(message);
    const asksQuiz = /(اختبرني|اختبر|اختبار|امتحني|امتحان|اسالني سوال)/u.test(normalized);
    const oneAtATime = /(سوال واحد|واحد في كل مره|كل مره سوال|سوالا واحدا)/u.test(normalized);
    if (asksQuiz) return { mode: "quiz", oneAtATime, explicit: true };
    if (/(لخص|تلخيص|ملخص)/u.test(normalized)) return { mode: "summarize", explicit: true };
    if (/(اشرح|شرح|وضح|فسر|علمني)/u.test(normalized)) return { mode: "explain", explicit: true };
    if (/(امثله|مثال|اعطني مثالا|اعطني امثله)/u.test(normalized)) return { mode: "explain", explicit: true };
    if (/(بطاقات|فلاش|flashcards)/u.test(normalized)) return { mode: "flashcards", explicit: true };
    if (/(خريطه ذهنيه|خريطه مفاهيم)/u.test(normalized)) return { mode: "mindmap", explicit: true };
    if (/(^| )(ما|ماذا|كيف|لماذا|كم|هل|احسب|اوجد|عرف)( |$)/u.test(normalized)) {
      return { mode: "answer", explicit: true };
    }
    return { mode: state.studyMode, oneAtATime: false, explicit: false };
  }
  function asksForSource(message) {
    return /(مصدر|مصادر|مرجع|مراجع|من اي كتاب|من اي صفحه|رقم الصفحه)/u.test(normalizeArabic(message));
  }
  const SCIENCE_EXPLANATION_INSTRUCTIONS = `تعليمات ثابتة لكل الردود:
- اللغة الافتراضية هي العربية الواضحة المناسبة لطلاب ${TARGET_GRADE} في اليمن. اكتب العناوين والتعليقات وشرح الخطوات بالعربية؛ يُسمح بالرموز الرياضية والفيزيائية والكيميائية كما هي في المصدر.
- استخدم الكتاب المحدد مصدرًا أساسيًا للتعريفات والقوانين والمنهج. طابق المعنى لا الألفاظ وحدها؛ عدم ظهور صياغة السؤال حرفيًا لا يعني غياب المعلومة.
- أجب عن أسئلة الدرس ذات الصلة اعتمادًا على المقاطع المناسبة، ويمكنك شرحها أو استنتاج نتيجة منها بوضوح. إذا كانت المعلومة خارج المنهج فأجب عنها إذا كنت واثقًا وميّزها بوصفها معلومة إضافية. إذا لم تكفِ الأدلة أو لم تكن متأكدًا فاذكر ذلك ولا تختلق إجابة.
- عند تناول قانون أو معادلة في الرياضيات أو الفيزياء أو الكيمياء، اعتمد أولًا على المقاطع المسترجعة من الكتاب المحدد. انقل الصيغة والرموز والوحدات وشروط الاستخدام كما تظهر في المقطع، ولا تستبدل رمزًا لاتينيًا مثل F أو r أو θ أو تغيّر اصطلاح الكتاب.
- أعطِ أولوية للمقاطع الموسومة بأنها مدققة بمقابلتها مع PDF الأصلي عند صلتها بالسؤال، ثم استخدم نص OCR بوصفه قرينة لا بديلًا عن صيغة واضحة. إذا تعارض OCR مع مقطع مدقق، فاتبع المقطع المدقق واذكر حدود المصدر عند الحاجة.
- عرّف كل رمز بالعربية، واذكر وحدة القياس وطريقة التعويض فقط إذا دعمها نص الكتاب أو بيانات المسألة. لا تخترع وحدة أو قيمة أو شرطًا. ميّز بوضوح بين ما يقوله المصدر وما يقدمه الطالب.
- قد تكون OCR المقاطع المصورة مشوهة: لا تنسب صيغة غير مقروءة إلى الكتاب. إذا لم يتوفر نص مناسب، استخدم معرفتك الموثوقة للإجابة مع توضيح أنها شرح إضافي غير متحقق من نص الكتاب، أو اذكر عدم اليقين عند الحاجة؛ لا ترفض الإجابة تلقائيًا لمجرد نقص الفهرسة.
- إذا زوّد الطالب القانون صراحةً في سؤاله وكانت المسألة محددة، فيجوز حل الحساب وفق الصيغة التي كتبها الطالب، مع توضيح أنها صيغة السؤال لا صيغة تحققت نسبتها إلى الكتاب؛ لا تصادق على نسبتها للكتاب دون نص واضح.
- اعرض كل معادلة على سطر مستقل محاط بعلامتي $$، وبالصيغة النصية الواضحة ورموز المصدر نفسها؛ لا تضع شرحًا عربيًا داخل سطر المعادلة. ستعرض الواجهة المعادلات من اليسار إلى اليمين والنص من اليمين إلى اليسار. لا تستخدم HTML.
- في المسألة الحسابية رتّب الرد بالعربية تحت العناوين: المعطيات، المطلوب، القانون، التعويض، خطوات الحساب، النتيجة النهائية ووحدتها. لا تملأ أي قسم بافتراضات؛ إذا غاب القانون أو المعطى الضروري في المصادر أو السؤال، فصرّح بالنقص واطلبه.
- لا تخترع قانونًا أو تعريفًا أو اقتباسًا أو رقم صفحة. لا تذكر المصادر أو اسم الكتاب في خاتمة الإجابة إلا إذا طلب الطالب المرجع.`;

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
    const contextKey = `${track}|${subject}|${bookName}|${lesson}`;
    if (state.conversationContext && state.conversationContext !== contextKey) {
      state.messages = [];
      state.activeQuiz = null;
      setStudyMode("answer");
      $("conversation").replaceChildren();
      $("welcome-panel").classList.remove("hidden");
    }
    state.conversationContext = contextKey;
    const request = classifyRequest(message);
    let requestMode = request.mode;
    if (request.explicit && requestMode !== "quiz") {
      state.activeQuiz = null;
    } else if (request.explicit && requestMode === "quiz") {
      state.activeQuiz = {
        lesson: lesson || message.replace(/اختبرني|اختبر|اختبار|امتحني|امتحان|اسألني|اسالني|في درس|في هذا الدرس/gu, " ").trim() || message,
        questionNumber: 1,
        awaitingAnswer: false
      };
    } else if (state.activeQuiz?.awaitingAnswer) {
      requestMode = "quizAnswer";
    } else if (requestMode === "quiz") {
      state.activeQuiz = {
        lesson: lesson || message.replace(/اختبرني|اختبر|اختبار|امتحني|امتحان|اسألني|اسالني|في درس|في هذا الدرس/gu, " ").trim() || message,
        questionNumber: 1,
        awaitingAnswer: false
      };
    } else {
      state.activeQuiz = null;
    }
    setStudyMode(requestMode === "quizAnswer" ? "quiz" : requestMode);
    const modeInstruction = MODE_INSTRUCTIONS[requestMode] || MODE_INSTRUCTIONS.answer;
    const bookContext = getBookContext(track, subject, bookName, `${lesson} ${message}`);
    const isFreeMessage = state.subscriptionExpiresAt <= Date.now();
    if (isFreeMessage && !recordFreeMessage()) return;
    const subscriptionRequiredAfterReply = isFreeMessage && state.freeMessages >= FREE_MESSAGE_LIMIT;
    addMessage("user", message);
    $("message-input").value = "";
    state.messages.push({ role: "user", content: message });
    state.busy = true;
    $("send-button").disabled = true;
    const pending = addMessage("assistant", "أراجع سؤالك وأجهز الإجابة...", "typing");
    const sourceRequestInstruction = asksForSource(message)
      ? bookContext.matched
        ? "طلب الطالب المرجع صراحةً؛ اذكر مرجع المقطع المستخدم وبيانات صفحته إذا كانت متاحة. إذا لم يتوفر المرجع فلا تخترع واحدًا."
        : "طلب الطالب المرجع صراحةً، لكن لا يوجد مقطع مطابق للاستشهاد به؛ صرّح بذلك ولا تنسب إجابته إلى مقطع غير ذي صلة."
      : "لا تذكر اسم الكتاب أو المصادر في بداية الإجابة أو نهايتها ولا تعرض قائمة مراجع تلقائيًا.";
    const retrievalInstruction = bookContext.matched
      ? `مقاطع استرجعها البحث من الكتاب المحدد لصلتها بالكلمات أو عنوان الدرس:\n${bookContext.excerpts.join("\n\n---\n\n")}`
      : bookContext.excerpts.length
        ? `لم يعثر البحث على تطابق دلالي أو لفظي كافٍ؛ هذه أفضل مقاطع متاحة من الكتاب المحدد كخلفية فقط وليست دليلًا على أن المعلومة واردة فيه. لا تعتبر ذلك سببًا لرفض السؤال؛ أجب من معرفتك الموثوقة إذا أمكن، وميّز الشرح الإضافي عن نص الكتاب، وإلا فاذكر عدم اليقين بوضوح.\n${bookContext.excerpts.join("\n\n---\n\n")}`
        : "لم يتوفر نص مفهرس من الكتاب المحدد. لا تعتبر نقص الفهرسة دليلًا على غياب المعلومة؛ أجب من معرفتك الموثوقة إذا أمكن، وميّز الشرح الإضافي عن نص الكتاب، وإلا فاذكر عدم اليقين بوضوح.";
    const quizInstruction = requestMode === "quiz"
      ? `الاختبار تفاعلي، وهذه الجولة رقم ${state.activeQuiz.questionNumber}. اطرح سؤالًا واحدًا فقط عن درس «${state.activeQuiz.lesson}» ثم انتظر الإجابة. لا تكتب تلميح الإجابة أو الحل أو أسئلة أخرى. ${request.oneAtATime ? "طلب الطالب صراحةً سؤالًا واحدًا في كل مرة، فالتزم بذلك حرفيًا." : ""}`
      : requestMode === "quizAnswer"
        ? `صحّح الآن إجابة الطالب عن السؤال السابق في الاختبار التفاعلي. بعد التصحيح والشرح، اطرح سؤالًا واحدًا فقط (السؤال ${state.activeQuiz.questionNumber + 1}) عن درس «${state.activeQuiz.lesson}» ثم انتظر إجابته. لا تكشف الإجابة عن السؤال الجديد.`
        : "";
    const systemPrompt = `أنت بيمو، مساعد دراسي لطلاب ${TARGET_GRADE} في العلاء أكاديمي.
${SCIENCE_EXPLANATION_INSTRUCTIONS}
نفّذ المهمة التالية: ${modeInstruction}
المادة: ${subject}. الكتاب المحدد: ${bookName}. القسم: ${track}. الدرس الذي أدخله الطالب: ${lesson || "لم يحدد"}.
أجب عن السؤال المباشر أولًا ثم اشرح السبب، أو نفّذ نية الطالب المحددة أعلاه دون استبدالها بمهمة أخرى. لا تخلط بين طلب الشرح والاختبار. ${sourceRequestInstruction}
لا تختلق مصادر أو اقتباسات أو صفحات، ولا تخلط بين المواد أو الكتب.
${quizInstruction}
${retrievalInstruction}`;
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
            ...state.messages.slice(-12)
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
      pending.classList.remove("typing");
      const answerBody = pending.querySelector(".message-content");
      answerBody.replaceChildren();
      appendMessageContent(answerBody, answer.trim());
      if (asksForSource(message) && bookContext.matched) addSources(pending, bookContext.sources);
      state.messages.push({ role: "assistant", content: answer });
      if (requestMode === "quiz" || requestMode === "quizAnswer") {
        if (requestMode === "quizAnswer") state.activeQuiz.questionNumber++;
        state.activeQuiz.awaitingAnswer = true;
      }
    } catch (error) {
      pending.classList.remove("typing");
      const lastMessage = state.messages[state.messages.length - 1];
      if (lastMessage?.role === "user" && lastMessage.content === message) state.messages.pop();
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
  let isInstalled = window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
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
    installStatus.classList.add("hidden");
  });

  installButton.addEventListener("click", async () => {
    if (!installPrompt) {
      installStatus.textContent = isIOS
        ? "افتح قائمة المشاركة في Safari ثم اختر «إضافة إلى الشاشة الرئيسية»."
        : "من قائمة المتصفح اختر «تثبيت التطبيق» أو «إضافة إلى الشاشة الرئيسية».";
      installStatus.classList.remove("hidden");
      return;
    }

    const prompt = installPrompt;
    installPrompt = null;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      if (choice.outcome === "accepted") {
        installButton.classList.add("hidden");
        installStatus.textContent = "تم بدء تثبيت بيمو على جهازك.";
      } else {
        installStatus.textContent = "لم يتم التثبيت. يمكنك المحاولة مرة أخرى من هذا الزر.";
      }
      installStatus.classList.remove("hidden");
    } catch (error) {
      console.error("تعذر بدء تثبيت بيمو:", error);
      installStatus.textContent = "تعذر بدء التثبيت. أعد تحميل الصفحة وتأكد من دعم المتصفح للتثبيت.";
      installStatus.classList.remove("hidden");
    }
  });

  window.addEventListener("appinstalled", () => {
    isInstalled = true;
    installPrompt = null;
    installButton.classList.add("hidden");
    installStatus.textContent = "تم تثبيت بيمو بنجاح.";
    installStatus.classList.remove("hidden");
  });

  if ("serviceWorker" in navigator && window.isSecureContext) {
    navigator.serviceWorker.register("./service-worker.js").catch((error) => {
      console.error("تعذر تفعيل دعم العمل دون اتصال:", error);
      installStatus.textContent = "تعذر تجهيز التطبيق للعمل دون اتصال. أعد تحميل الصفحة وحاول مجددًا.";
      installStatus.classList.remove("hidden");
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
