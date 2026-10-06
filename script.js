const homeView = document.querySelector("#homeView");
const authView = document.querySelector("#authView");
const leaderboardView = document.querySelector("#leaderboardView");
const dashboardView = document.querySelector("#dashboardView");
const moduleView = document.querySelector("#moduleView");
const quizView = document.querySelector("#quizView");
const resultView = document.querySelector("#resultView");
const standardAuth = document.querySelector("#standardAuth");
const adminPortal = document.querySelector("#adminPortal");
const authForm = document.querySelector("#authForm");
const adminForm = document.querySelector("#adminForm");
const authTitle = document.querySelector("#authTitle");
const authEyebrow = document.querySelector("#authEyebrow");
const authAction = document.querySelector("#authAction");
const authFeedback = document.querySelector("#authFeedback");
const nameField = document.querySelector("#nameField");
const displayName = document.querySelector("#displayName");
const emailInput = document.querySelector("#email");
const passwordInput = document.querySelector("#password");
const accountButton = document.querySelector("#accountButton");
const legalDialog = document.querySelector("#legalDialog");
const subjectGrid = document.querySelector("#subjectGrid");
const answerList = document.querySelector("#answerList");
const answerNext = document.querySelector("#answerNext");

const views = [homeView, authView, leaderboardView, dashboardView, moduleView, quizView, resultView];
const API_BASE = window.location.protocol === "file:" ? "http://127.0.0.1:5000" : window.location.origin;
let authMode = "login";
let logoClicks = [];
let signedInUser = readStoredUser();
let subjectCatalog = [];
let progressBySubject = {};
let activeSubject = null;
let activeModule = null;
let currentRound = 1;
let currentQuestions = [];
let questionIndex = 0;
let score = 0;
let answerSelected = false;

function readStoredUser() {
  if (!localStorage.getItem("bytewiseToken")) return null;
  try {
    const user = JSON.parse(localStorage.getItem("bytewiseUser") || "null");
    return user && typeof user.email === "string" ? user : null;
  } catch {
    return null;
  }
}

async function apiRequest(path, { method = "GET", body, authenticated = true } = {}) {
  const headers = new Headers();
  const token = authenticated ? localStorage.getItem("bytewiseToken") : null;
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (body !== undefined) headers.set("Content-Type", "application/json");

  const response = await fetch(`${API_BASE}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    if (response.status === 401 && authenticated) clearSession();
    throw new Error(payload.error || `Request failed (${response.status}).`);
  }
  return payload;
}

function storeSession(session) {
  localStorage.setItem("bytewiseToken", session.token);
  localStorage.setItem("bytewiseUser", JSON.stringify(session.user));
  signedInUser = session.user;
  updateAccountButton();
}

function clearSession() {
  localStorage.removeItem("bytewiseToken");
  localStorage.removeItem("bytewiseUser");
  signedInUser = null;
  updateAccountButton();
}

function showStandardAuth() {
  standardAuth.classList.remove("hidden");
  adminPortal.classList.add("hidden");
}

function getModuleProgress(subject, moduleId) {
  const moduleType = moduleId === "theory" ? "Theory" : "Lab";
  return progressBySubject[subject.subject]?.[moduleType] || {
    completed_round: 0,
    rounds_completed: 0,
    best_score: 0,
    xp: 0,
  };
}

function showView(view) {
  views.forEach((item) => item.classList.add("hidden"));
  view.classList.remove("hidden");
  document.querySelectorAll(".main-nav .nav-link").forEach((link) => {
    link.classList.toggle(
      "active",
      (view === homeView && link.hasAttribute("data-home-link")) ||
        (view === leaderboardView && link.hasAttribute("data-toppers-link")),
    );
  });
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function showHome() {
  showStandardAuth();
  showView(homeView);
}

function showAuth(mode = "login") {
  showStandardAuth();
  showView(authView);
  setAuthMode(mode);
}

async function showDashboard() {
  showView(dashboardView);
  await renderDashboard();
}

async function showLeaderboard() {
  showView(leaderboardView);
  await renderLeaderboard();
}

function showModuleSelection() {
  if (!activeSubject) return showDashboard();
  document.querySelector("#moduleEyebrow").textContent = `${activeSubject.title.toUpperCase()} / CHOOSE A PATH`;
  document.querySelector("#moduleDescription").textContent = `Build understanding, then put it to work in ${activeSubject.title}.`;
  ["theory", "lab"].forEach((moduleId) => {
    const card = document.querySelector(`[data-module="${moduleId}"]`);
    const progress = getModuleProgress(activeSubject, moduleId);
    const moduleType = moduleId === "theory" ? "Theory" : "Lab";
    const count = activeSubject.question_counts[moduleType];
    const label = moduleId === "theory" ? "Theory Concepts" : "Lab Programs";
    card.querySelector(".module-card-copy small").textContent = `${count} questions · ${progress.completed_round}/5 rounds cleared`;
    card.setAttribute("aria-label", `${label}, ${count} questions, ${progress.completed_round} of 5 rounds cleared`);
  });
  document.querySelector("#bankNote").textContent = "The current source bank contains 25 unique questions per module; the seed script cycles them across five 10-question rounds.";
  showView(moduleView);
}

function setAuthMode(mode) {
  authMode = mode;
  const isRegister = mode === "register";
  document.querySelectorAll(".auth-tab").forEach((tab) => {
    const isActive = tab.dataset.mode === mode;
    tab.classList.toggle("active", isActive);
    tab.setAttribute("aria-selected", String(isActive));
  });
  nameField.classList.toggle("hidden", !isRegister);
  displayName.required = isRegister;
  passwordInput.autocomplete = isRegister ? "new-password" : "current-password";
  authEyebrow.textContent = isRegister ? "YOUR NEXT CHAPTER" : "WELCOME BACK";
  authTitle.textContent = isRegister ? "Create room to grow." : "Pick up where you left off.";
  authAction.textContent = isRegister ? "Create account" : "Sign in";
  authFeedback.textContent = "Your password is sent securely to the Bytewise API and stored as a hash.";
}

function updateAccountButton() {
  accountButton.replaceChildren();
  accountButton.append(document.createTextNode(signedInUser ? signedInUser.name || "Profile" : "Sign in"));
  accountButton.setAttribute("aria-label", signedInUser ? `Sign out ${signedInUser.name || "account"}` : "Sign in");
  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";
  accountButton.append(arrow);
}

async function renderDashboard() {
  const dashboardFootnote = document.querySelector(".dashboard-footnote");
  dashboardFootnote.textContent = "Loading your subjects and progress...";
  try {
    const [subjectsResponse, progressResponse] = await Promise.all([
      apiRequest("/api/subjects", { authenticated: false }),
      apiRequest("/api/progress"),
    ]);
    subjectCatalog = subjectsResponse.subjects;
    progressBySubject = progressResponse.progress;
  } catch (error) {
    dashboardFootnote.textContent = error.message;
    return;
  }

  let roundsCleared = 0;
  let totalXpValue = 0;

  subjectGrid.replaceChildren();
  subjectCatalog.forEach((subject) => {
    const theoryProgress = progressBySubject[subject.subject]?.Theory || { rounds_completed: 0, xp: 0 };
    const labProgress = progressBySubject[subject.subject]?.Lab || { rounds_completed: 0, xp: 0 };
    const completedRounds = Math.min(5, theoryProgress.rounds_completed || 0) + Math.min(5, labProgress.rounds_completed || 0);
    const percent = Math.round((completedRounds / 10) * 100);
    roundsCleared += completedRounds;
    totalXpValue += (theoryProgress.xp || 0) + (labProgress.xp || 0);

    const card = document.createElement("button");
    card.type = "button";
    card.className = "subject-card";
    card.setAttribute("aria-label", `${subject.title}, ${percent}% progress`);
    card.innerHTML = `<span class="subject-card-top"><span class="subject-icon"></span><span class="subject-arrow" aria-hidden="true">&#8594;</span></span><h3></h3><p></p><span class="subject-progress-meta"><span>${completedRounds}/10 rounds</span><span>${percent}%</span></span><span class="subject-progress-track"><span></span></span>`;
    card.querySelector(".subject-icon").textContent = subject.short;
    card.querySelector("h3").textContent = subject.title;
    card.querySelector("p").textContent = subject.description;
    card.querySelector(".subject-progress-track span").style.width = `${percent}%`;
    card.addEventListener("click", () => {
      activeSubject = subject;
      showModuleSelection();
    });
    subjectGrid.append(card);
  });

  document.querySelector("#roundsComplete").textContent = roundsCleared;
  document.querySelector("#totalXp").textContent = totalXpValue;
  document.querySelector("#subjectCount").textContent = `${String(subjectCatalog.length).padStart(2, "0")} SUBJECTS`;
  document.querySelector("#dashboardGreeting").textContent = signedInUser?.name
    ? `Good to see you, ${signedInUser.name}. A little practice goes a long way.`
    : "A little practice goes a long way.";
  dashboardFootnote.innerHTML = '<span aria-hidden="true">&#9670;</span> Choose a subject to pick up where you left off.';
}

async function renderLeaderboard(silent = false) {
  const podium = document.querySelector("#podiumGrid");
  const rows = document.querySelector("#leaderboardRows");
  const feedback = document.querySelector("#leaderboardFeedback");
  feedback.textContent = "";

  try {
    const response = await apiRequest("/api/leaderboard", { authenticated: false });
    const rankings = response.leaderboard;
    podium.replaceChildren();
    rows.replaceChildren();

    const podiumEntries = [
      { student: rankings[1], rank: 2 },
      { student: rankings[0], rank: 1 },
      { student: rankings[2], rank: 3 },
    ].filter((entry) => entry.student);

    podiumEntries.forEach(({ student, rank }) => {
      const card = document.createElement("article");
      card.className = `podium-card rank-${rank}`;
      card.innerHTML = '<span class="podium-medal"></span><strong class="podium-name"></strong><span class="podium-rounds"></span><span class="podium-score"></span><span class="podium-place"></span>';
      card.querySelector(".podium-medal").textContent = String(rank);
      card.querySelector(".podium-name").textContent = student.name;
      card.querySelector(".podium-rounds").textContent = `${student.rounds_completed} rounds cleared`;
      card.querySelector(".podium-score").textContent = `${student.total_score} / ${student.rounds_completed * 10}`;
      card.querySelector(".podium-place").textContent = rank === 1 ? "TOPPER" : rank === 2 ? "RUNNER-UP" : "THIRD PLACE";
      podium.append(card);
    });

    if (rankings.length === 0) {
      podium.innerHTML = '<p class="podium-empty">No scores yet. Complete a round to claim the first spot.</p>';
      const emptyRow = document.createElement("tr");
      emptyRow.className = "empty-row";
      emptyRow.innerHTML = '<td colspan="4">No completed rounds yet. Your first result will appear here.</td>';
      rows.append(emptyRow);
    } else {
      rankings.forEach((student) => {
        const row = document.createElement("tr");
        const values = [
          `#${student.rank}`,
          student.name,
          student.rounds_completed,
          `${student.total_score} / ${student.rounds_completed * 10}`,
        ];
        values.forEach((value) => {
          const cell = document.createElement("td");
          cell.textContent = value;
          row.append(cell);
        });
        rows.append(row);
      });
    }
    document.querySelector("#leaderboardUpdated").textContent = `UPDATED ${new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    if (!silent) feedback.textContent = error.message;
  }
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

async function beginModule(moduleId) {
  if (!activeSubject || !["theory", "lab"].includes(moduleId)) return;
  const moduleType = moduleId === "theory" ? "Theory" : "Lab";
  const progress = getModuleProgress(activeSubject, moduleId);
  activeModule = {
    id: moduleId,
    type: moduleType,
    title: moduleId === "theory" ? "Theory Concepts" : "Lab Programs",
  };
  currentRound = progress.completed_round >= 5 ? 1 : progress.completed_round + 1;
  await startRound(currentRound);
}

async function startRound(roundNumber = currentRound) {
  currentRound = Math.min(Math.max(roundNumber, 1), 5);
  try {
    const query = new URLSearchParams({
      subject: activeSubject.subject,
      type: activeModule.type,
      round: String(currentRound),
    });
    const response = await apiRequest(`/api/questions?${query}`, { authenticated: false });
    if (!Array.isArray(response.questions) || response.questions.length !== 10) {
      throw new Error("The selected round is not ready. Ask an administrator to seed 10 questions.");
    }
    currentQuestions = shuffle(response.questions);
    questionIndex = 0;
    score = 0;
    showView(quizView);
    renderQuestion();
  } catch (error) {
    document.querySelector("#bankNote").textContent = error.message;
    showView(moduleView);
  }
}

function renderRoundProgress(answeredCount = questionIndex) {
  const percent = Math.round((answeredCount / 10) * 100);
  document.querySelector("#questionPosition").textContent = String(questionIndex + 1).padStart(2, "0");
  document.querySelector("#roundPercent").textContent = `${percent}%`;
  document.querySelector("#roundProgressBar").style.width = `${percent}%`;
  document.querySelector("#roundDots").innerHTML = Array.from({ length: 5 }, (_, index) => {
    const round = index + 1;
    const state = round < currentRound ? "complete" : round === currentRound ? "active" : "";
    return `<span class="round-dot ${state}" aria-label="Round ${round}${state ? `, ${state}` : ""}"></span>`;
  }).join("");
}

function renderQuestion() {
  const item = currentQuestions[questionIndex];
  answerSelected = false;
  document.querySelector("#quizSubject").textContent = activeSubject.title;
  document.querySelector("#quizModule").textContent = activeModule.title;
  document.querySelector("#roundLabel").innerHTML = `Round ${currentRound} <span>/ 5</span>`;
  document.querySelector("#questionCategory").textContent = item.category.toLowerCase().includes("lab") ? "LAB PRACTICE" : "THEORY CONCEPTS";
  document.querySelector("#quizQuestion").textContent = item.question;
  document.querySelector("#answerFeedback").textContent = "";
  document.querySelector("#answerFeedback").className = "answer-feedback";
  answerNext.disabled = true;
  document.querySelector("#answerNextLabel").textContent = "Choose an answer";
  renderRoundProgress();

  answerList.replaceChildren();
  shuffle(item.options.map((text, index) => ({ text, index }))).forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "quiz-answer";
    button.dataset.answerIndex = option.index;
    const key = document.createElement("span");
    key.className = "answer-key";
    key.textContent = String.fromCharCode(65 + index);
    const label = document.createElement("span");
    label.textContent = option.text;
    button.append(key, label);
    button.addEventListener("click", () => selectAnswer(button, option.index, item));
    answerList.append(button);
  });
}

function selectAnswer(button, selectedIndex, question) {
  if (answerSelected) return;
  answerSelected = true;
  const isCorrect = selectedIndex === question.answer;
  if (isCorrect) score += 1;

  answerList.querySelectorAll(".quiz-answer").forEach((answer) => {
    answer.disabled = true;
    if (Number(answer.dataset.answerIndex) === question.answer) answer.classList.add("correct");
  });
  if (!isCorrect) button.classList.add("incorrect");

  const feedback = document.querySelector("#answerFeedback");
  feedback.classList.add(isCorrect ? "is-correct" : "is-wrong");
  feedback.textContent = isCorrect ? "Correct. Keep that momentum." : `Not quite. The answer is ${question.options[question.answer]}.`;
  answerNext.disabled = false;
  document.querySelector("#answerNextLabel").textContent = questionIndex === 9 ? "See round results" : "Next question";
  renderRoundProgress(questionIndex + 1);
}

async function finishRound() {
  let savedScore;
  try {
    savedScore = await apiRequest("/api/submit-score", {
      method: "POST",
      body: {
        subject: activeSubject.subject,
        module_type: activeModule.type,
        round_number: currentRound,
        score,
      },
    });
  } catch (error) {
    const feedback = document.querySelector("#answerFeedback");
    feedback.className = "answer-feedback is-wrong";
    feedback.textContent = `Could not save this round: ${error.message}`;
    answerNext.disabled = false;
    document.querySelector("#answerNextLabel").textContent = "Retry saving score";
    return;
  }

  document.querySelector("#resultScore").textContent = score;
  document.querySelector("#resultContext").textContent = `${activeSubject.title.toUpperCase()} / ${activeModule.title.toUpperCase()} / ROUND ${currentRound}`;
  document.querySelector("#resultXp").textContent = savedScore.xp_awarded
    ? `+${savedScore.xp_awarded} XP earned`
    : "Round saved · best score retained";
  if (score === 10) {
    document.querySelector("#resultTitle").textContent = "Flawless!";
    document.querySelector("#resultMessage").textContent = "Every answer landed. Your understanding is in excellent shape.";
  } else if (score >= 7) {
    document.querySelector("#resultTitle").textContent = "Strong round.";
    document.querySelector("#resultMessage").textContent = "You have a solid handle on these ideas. Keep the streak moving.";
  } else if (score >= 4) {
    document.querySelector("#resultTitle").textContent = "Good first pass.";
    document.querySelector("#resultMessage").textContent = "A few concepts are settling in. Another round will help connect the dots.";
  } else {
    document.querySelector("#resultTitle").textContent = "Keep building.";
    document.querySelector("#resultMessage").textContent = "Every missed question is useful feedback. Review, reset, and try again.";
  }

  document.querySelector("#nextRoundLabel").textContent = currentRound === 5 ? "Return to module" : "Start next round";
  showView(resultView);
  try {
    progressBySubject = (await apiRequest("/api/progress")).progress;
  } catch {
    progressBySubject = {};
  }
  await renderLeaderboard(true);
}

function updateAccountFromStorage() {
  if (!signedInUser) return;
  const storedUser = readStoredUser();
  if (storedUser) signedInUser = storedUser;
  updateAccountButton();
}

document.querySelectorAll("[data-open-auth]").forEach((button) => {
  button.addEventListener("click", () => showAuth(button.dataset.openAuth));
});

document.querySelectorAll(".auth-tab").forEach((tab) => {
  tab.addEventListener("click", () => setAuthMode(tab.dataset.mode));
});

document.querySelectorAll("[data-home-link]").forEach((link) => {
  link.addEventListener("click", (event) => {
    event.preventDefault();
    showHome();
    window.history.replaceState(null, "", "#home");
  });
});

document.querySelectorAll(".main-nav a").forEach((link) => {
  link.addEventListener("click", (event) => {
    if (link.hasAttribute("data-toppers-link")) return;
    if (homeView.classList.contains("hidden")) {
      event.preventDefault();
      showHome();
      requestAnimationFrame(() => document.querySelector(link.getAttribute("href"))?.scrollIntoView({ behavior: "smooth" }));
    }
  });
});

accountButton.addEventListener("click", () => {
  if (!signedInUser) return showAuth("login");
  clearSession();
  showHome();
});

authForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  authAction.textContent = "Connecting...";
  try {
    const isRegister = authMode === "register";
    const session = await apiRequest(isRegister ? "/api/register" : "/api/login", {
      method: "POST",
      authenticated: false,
      body: {
        name: displayName.value.trim(),
        email: emailInput.value.trim(),
        password: passwordInput.value,
      },
    });
    storeSession(session);
    authForm.reset();
    await showDashboard();
  } catch (error) {
    authFeedback.textContent = error.message;
  } finally {
    authAction.textContent = authMode === "register" ? "Create account" : "Sign in";
  }
});

document.querySelector("[data-toppers-link]").addEventListener("click", (event) => {
  event.preventDefault();
  showLeaderboard();
});
document.querySelector("#refreshLeaderboard").addEventListener("click", () => renderLeaderboard());

document.querySelector("#brandButton").addEventListener("click", () => {
  const now = Date.now();
  logoClicks = logoClicks.filter((time) => now - time < 1800);
  logoClicks.push(now);
  if (logoClicks.length >= 5) {
    logoClicks = [];
    showAuth("login");
    standardAuth.classList.add("hidden");
    adminPortal.classList.remove("hidden");
    adminPortal.querySelector("#adminEmail").focus({ preventScroll: true });
    return;
  }
  if (!authView.classList.contains("hidden")) showHome();
  window.history.replaceState(null, "", "#home");
});

document.querySelector("#closeAdmin").addEventListener("click", () => {
  standardAuth.classList.remove("hidden");
  adminPortal.classList.add("hidden");
});

adminForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  const feedback = document.querySelector("#adminFeedback");
  feedback.textContent = "Verifying access...";
  try {
    const session = await apiRequest("/api/admin/login", {
      method: "POST",
      authenticated: false,
      body: {
        email: document.querySelector("#adminEmail").value.trim(),
        password: document.querySelector("#adminKey").value,
      },
    });
    storeSession(session);
    adminForm.reset();
    feedback.textContent = "Admin access verified. Your signed session is active.";
  } catch (error) {
    feedback.textContent = error.message;
  }
});

document.querySelector("#accountButton").addEventListener("focus", updateAccountFromStorage);
document.querySelector("#backToDashboard").addEventListener("click", showDashboard);
document.querySelector("#quitRound").addEventListener("click", showModuleSelection);
document.querySelectorAll("[data-module]").forEach((button) => {
  button.addEventListener("click", () => beginModule(button.dataset.module));
});

answerNext.addEventListener("click", async () => {
  if (!answerSelected) return;
  if (questionIndex === 9) {
    answerNext.disabled = true;
    document.querySelector("#answerNextLabel").textContent = "Saving score...";
    await finishRound();
    return;
  }
  questionIndex += 1;
  renderQuestion();
});

document.querySelector("#nextRound").addEventListener("click", () => {
  if (currentRound === 5) {
    showModuleSelection();
    return;
  }
  currentRound += 1;
  startRound();
});
document.querySelector("#returnDashboard").addEventListener("click", showDashboard);

const legalCopy = {
  privacy: "Bytewise stores account credentials as password hashes and saves quiz results in its SQLite database. Your signed session token is kept in this browser and can be cleared by signing out.",
  terms: "Use Bytewise for learning and exam preparation. Do not share your account credentials. Scores and leaderboard rankings are based on submitted round results."
};

document.querySelectorAll("[data-legal]").forEach((button) => {
  button.addEventListener("click", () => {
    const policy = button.dataset.legal;
    document.querySelector("#legalTitle").textContent = policy === "privacy" ? "Privacy policy" : "Terms of service";
    document.querySelector("#legalCopy").textContent = legalCopy[policy];
    legalDialog.showModal();
  });
});
document.querySelector("#closeLegal").addEventListener("click", () => legalDialog.close());
legalDialog.addEventListener("click", (event) => {
  if (event.target === legalDialog) legalDialog.close();
});

document.querySelector("#currentYear").textContent = new Date().getFullYear();
updateAccountButton();