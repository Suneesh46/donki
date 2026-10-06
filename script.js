const homeView = document.querySelector("#homeView");
const authView = document.querySelector("#authView");
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

const views = [homeView, authView, dashboardView, moduleView, quizView, resultView];
let authMode = "login";
let logoClicks = [];
let signedInUser = readStoredUser();
let activeSubject = null;
let activeModule = null;
let currentRound = 1;
let currentQuestions = [];
let questionIndex = 0;
let score = 0;
let answerSelected = false;

function readStoredUser() {
  try {
    const user = JSON.parse(localStorage.getItem("bytewiseUser") || "null");
    return user && typeof user.email === "string" ? user : null;
  } catch {
    return null;
  }
}

function readProgress() {
  try {
    return JSON.parse(localStorage.getItem("bytewiseProgress") || "{}");
  } catch {
    return {};
  }
}

function saveProgress(progress) {
  localStorage.setItem("bytewiseProgress", JSON.stringify(progress));
}

function showStandardAuth() {
  standardAuth.classList.remove("hidden");
  adminPortal.classList.add("hidden");
}

function getModuleProgress(subjectId, moduleId) {
  return readProgress()[subjectId]?.[moduleId] || { completedRound: 0, bestScore: 0, xp: 0 };
}

function showView(view) {
  views.forEach((item) => item.classList.add("hidden"));
  view.classList.remove("hidden");
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

function showDashboard() {
  renderDashboard();
  showView(dashboardView);
}

function showModuleSelection() {
  if (!activeSubject) return showDashboard();
  document.querySelector("#moduleEyebrow").textContent = `${activeSubject.title.toUpperCase()} / CHOOSE A PATH`;
  document.querySelector("#moduleDescription").textContent = `Build understanding, then put it to work in ${activeSubject.title}.`;
  ["theory", "lab"].forEach((moduleId) => {
    const card = document.querySelector(`[data-module="${moduleId}"]`);
    const progress = getModuleProgress(activeSubject.id, moduleId);
    const count = activeSubject[moduleId].length;
    const label = moduleId === "theory" ? "Theory Concepts" : "Lab Programs";
    card.querySelector(".module-card-copy small").textContent = `${count} unique questions · ${progress.completedRound}/5 rounds cleared`;
    card.setAttribute("aria-label", `${label}, ${count} questions, ${progress.completedRound} of 5 rounds cleared`);
  });
  document.querySelector("#bankNote").textContent = "Each module currently has 25 unique questions. Rounds contain 10 questions; later rounds may revisit earlier questions until the bank is expanded.";
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
  authFeedback.textContent = "This preview stores account details only in this browser. No password is saved.";
}

function updateAccountButton() {
  accountButton.replaceChildren();
  accountButton.append(document.createTextNode(signedInUser ? signedInUser.name || "Profile" : "Sign in"));
  const arrow = document.createElement("span");
  arrow.setAttribute("aria-hidden", "true");
  arrow.textContent = "↗";
  accountButton.append(arrow);
}

function renderDashboard() {
  const progress = readProgress();
  let roundsCleared = 0;
  let totalXpValue = 0;

  subjectGrid.replaceChildren();
  window.subjectCatalog.forEach((subject) => {
    const theoryProgress = progress[subject.id]?.theory || { completedRound: 0 };
    const labProgress = progress[subject.id]?.lab || { completedRound: 0 };
    const completedRounds = Math.min(5, theoryProgress.completedRound || 0) + Math.min(5, labProgress.completedRound || 0);
    const percent = Math.round((completedRounds / 10) * 100);
    roundsCleared += completedRounds;
    totalXpValue += (progress[subject.id]?.theory?.xp || 0) + (progress[subject.id]?.lab?.xp || 0);

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
  document.querySelector("#subjectCount").textContent = `${String(window.subjectCatalog.length).padStart(2, "0")} SUBJECTS`;
  document.querySelector("#dashboardGreeting").textContent = signedInUser?.name
    ? `Good to see you, ${signedInUser.name}. A little practice goes a long way.`
    : "A little practice goes a long way.";
}

function shuffle(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[randomIndex]] = [shuffled[randomIndex], shuffled[index]];
  }
  return shuffled;
}

function beginModule(moduleId) {
  const questions = activeSubject?.[moduleId];
  if (!questions?.length) return;
  activeModule = { id: moduleId, title: moduleId === "theory" ? "Theory Concepts" : "Lab Programs", questions };
  const completedRound = getModuleProgress(activeSubject.id, moduleId).completedRound;
  currentRound = completedRound >= 5 ? 1 : completedRound + 1;
  startRound();
}

function startRound() {
  currentQuestions = shuffle(activeModule.questions).slice(0, 10);
  currentRound = Math.min(Math.max(currentRound, 1), 5);
  questionIndex = 0;
  score = 0;
  showView(quizView);
  renderQuestion();
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

function finishRound() {
  const progress = readProgress();
  const subjectProgress = progress[activeSubject.id] || {};
  const moduleProgress = subjectProgress[activeModule.id] || { completedRound: 0, bestScore: 0, xp: 0 };
  const earnedXp = score * 10;
  moduleProgress.completedRound = Math.max(moduleProgress.completedRound, currentRound);
  moduleProgress.bestScore = Math.max(moduleProgress.bestScore, score);
  moduleProgress.xp += earnedXp;
  subjectProgress[activeModule.id] = moduleProgress;
  progress[activeSubject.id] = subjectProgress;
  saveProgress(progress);

  document.querySelector("#resultScore").textContent = score;
  document.querySelector("#resultContext").textContent = `${activeSubject.title.toUpperCase()} / ${activeModule.title.toUpperCase()} / ROUND ${currentRound}`;
  document.querySelector("#resultXp").textContent = `+${earnedXp} XP earned`;
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

  const nextRoundButton = document.querySelector("#nextRound");
  document.querySelector("#nextRoundLabel").textContent = currentRound === 5 ? "Return to module" : "Start next round";
  showView(resultView);
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
    if (homeView.classList.contains("hidden")) {
      event.preventDefault();
      showHome();
      requestAnimationFrame(() => document.querySelector(link.getAttribute("href"))?.scrollIntoView({ behavior: "smooth" }));
    }
  });
});

accountButton.addEventListener("click", () => {
  if (!signedInUser) return showAuth("login");
  signedInUser = null;
  localStorage.removeItem("bytewiseUser");
  updateAccountButton();
  showHome();
});

authForm.addEventListener("submit", (event) => {
  event.preventDefault();
  if (authMode === "register") {
    signedInUser = { name: displayName.value.trim(), email: emailInput.value.trim() };
    localStorage.setItem("bytewiseUser", JSON.stringify(signedInUser));
    updateAccountButton();
    showDashboard();
    return;
  }

  const savedUser = readStoredUser();
  if (savedUser && savedUser.email.toLowerCase() === emailInput.value.trim().toLowerCase()) {
    signedInUser = savedUser;
    updateAccountButton();
    showDashboard();
    return;
  }
  authFeedback.textContent = "This front-end preview has no account service. Create a local demo account to continue.";
});

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

adminForm.addEventListener("submit", (event) => {
  event.preventDefault();
  document.querySelector("#adminFeedback").textContent = "Admin sign-in requires a server-backed identity provider. No credentials were sent or stored.";
});

document.querySelector("#accountButton").addEventListener("focus", updateAccountFromStorage);
document.querySelector("#backToDashboard").addEventListener("click", showDashboard);
document.querySelector("#quitRound").addEventListener("click", showModuleSelection);
document.querySelectorAll("[data-module]").forEach((button) => {
  button.addEventListener("click", () => beginModule(button.dataset.module));
});

answerNext.addEventListener("click", () => {
  if (!answerSelected) return;
  if (questionIndex === 9) {
    finishRound();
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
  privacy: "Bytewise is a front-end preview. This version stores only a demo display name, email, and learning progress in your browser's local storage. It does not send personal information to a server.",
  terms: "Use this preview for learning and evaluation. Account access, progress tracking, and leaderboard features are not yet backed by a production service."
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