import { useState, useEffect } from "react";
import Editor from "@monaco-editor/react";
import liveProblems from "./liveProblems";
import "./App.css";

// custom Monaco theme that matches the style guide colours
function setupTheme(monaco) {
  monaco.editor.defineTheme("indigo-night", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "8581aa" },
      { token: "keyword", foreground: "a79cff" },
      { token: "string", foreground: "7ed3a9" },
      { token: "number", foreground: "e0c85e" },
    ],
    colors: {
      "editor.background": "#202033",
      "editor.lineHighlightBackground": "#29283b",
      "editorLineNumber.foreground": "#5f5d71",
      "editorCursor.foreground": "#a79cff",
      "editor.selectionBackground": "#46447a",
    },
  });
}

// re-measure character widths once DM Mono has loaded
function handleMount(editor, monaco) {
  document.fonts.load('14px "DM Mono"').then(() => {
    monaco.editor.remeasureFonts();
  });
}

// turn any value into text we can show on screen
function show(value) {
  return value === undefined ? "undefined" : JSON.stringify(value);
}

// ["level up"] with params ["sentence"] becomes: sentence = "level up"
function formatInput(input, params) {
  return input.map((arg, i) => params[i] + " = " + show(arg)).join(", ");
}

// 75 seconds becomes "01:15"
function formatTime(totalSeconds) {
  const minutes = String(Math.floor(totalSeconds / 60)).padStart(2, "0");
  const seconds = String(totalSeconds % 60).padStart(2, "0");
  return minutes + ":" + seconds;
}

// run the user's function against a list of tests
function runTests(code, functionName, tests) {
  return tests.map((test) => {
    try {
      const userFunction = new Function(
        code + "\nreturn " + functionName + ";"
      )();
      // copy the input so the user's code can't change our test data
      const input = JSON.parse(JSON.stringify(test.input));
      const got = userFunction(...input);
      const passed = JSON.stringify(got) === JSON.stringify(test.expected);
      return { passed: passed, shown: show(got) };
    } catch (error) {
      return { passed: false, shown: "Error: " + error.message };
    }
  });
}

// run the code and collect everything it prints with console.log
function captureConsole(code) {
  const lines = [];
  const originalLog = console.log;

  console.log = (...args) =>
    lines.push(
      args.map((a) => (typeof a === "string" ? a : show(a))).join(" ")
    );

  try {
    new Function(code)();
  } catch (error) {
    lines.push("Error: " + error.message);
  }

  console.log = originalLog;
  return lines;
}

function App() {
  // every problem keeps its own code, clock, test results and status
  const [problems, setProblems] = useState(
    liveProblems.map((p) => ({
      ...p,
      code: p.submittedCode || p.starterCode,
      left: p.mins * 60, // seconds left on the clock
      status: p.submittedResult ? "Submitted" : "Solving",
      result: p.submittedResult || "",
      // a problem that is already handed in shows all its tests as passed
      testResults: p.submittedResult
        ? p.tests.map((t) => ({ passed: true, shown: show(t.expected) }))
        : null,
      consoleLines: [],
    }))
  );
  const [selectedId, setSelectedId] = useState(liveProblems[0].id);
  const [inboxOpen, setInboxOpen] = useState(true); // problems list open or collapsed
  const [bottomTab, setBottomTab] = useState("tests"); // "tests" or "console"
  const [activeCase, setActiveCase] = useState(0);

  // every second, take one second off each problem that is still being solved
  useEffect(() => {
    const id = setInterval(() => {
      setProblems((current) =>
        current.map((p) =>
          p.status === "Solving" && p.left > 0 ? { ...p, left: p.left - 1 } : p
        )
      );
    }, 1000);
    return () => clearInterval(id);
  }, []);

  const problem = problems.find((p) => p.id === selectedId);
  const isSubmitted = problem.status === "Submitted";
  const activeTest = problem.tests[activeCase];
  const activeResult = problem.testResults
    ? problem.testResults[activeCase]
    : null;
  const passedCount = problem.testResults
    ? problem.testResults.filter((r) => r.passed).length
    : 0;

  // change some fields on one problem
  function updateProblem(id, changes) {
    setProblems((current) =>
      current.map((p) => (p.id === id ? { ...p, ...changes } : p))
    );
  }

  // pick a problem from the list
  function selectProblem(id) {
    setSelectedId(id);
    setActiveCase(0);
    setBottomTab("tests");
  }

  // Run: show what the code prints
  function runCode() {
    updateProblem(problem.id, { consoleLines: captureConsole(problem.code) });
    setBottomTab("console");
  }

  // Run tests: check the code against the test cases
  function runAllTests() {
    updateProblem(problem.id, {
      testResults: runTests(problem.code, problem.functionName, problem.tests),
    });
    setBottomTab("tests");
  }

  // Submit: run the tests, then lock the problem and record the time used
  function submit() {
    const results = runTests(problem.code, problem.functionName, problem.tests);
    const passed = results.filter((r) => r.passed).length;
    const used = problem.mins * 60 - problem.left;
    const minutes = Math.floor(used / 60);
    const secs = String(used % 60).padStart(2, "0");

    updateProblem(problem.id, {
      testResults: results,
      status: "Submitted",
      result:
        passed + "/" + results.length + " tests passed · " + minutes + "m " + secs + "s used",
    });
    setBottomTab("tests");
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">JS</span>
          <span>
            Code<span className="brand-accent">Pad</span>
          </span>
        </div>
      </header>

      <main className="page">
        <div>
          <h1>Live sessions</h1>
          <p className="subtitle">
            Problems your mentor sends during a Google Meet call. Share your
            screen while you solve.
          </p>
        </div>

        <div className={"live-layout" + (inboxOpen ? "" : " collapsed")}>
          {/* LEFT: problems received (can be collapsed) */}
          <div className="card">
            {inboxOpen ? (
              <>
                <div className="card-heading">
                  <h2>Problems received</h2>
                  <button
                    className="icon-btn"
                    onClick={() => setInboxOpen(false)}
                    aria-expanded="true"
                    aria-label="Collapse problems list"
                    title="Collapse"
                  >
                    ‹
                  </button>
                </div>
                <ul className="inbox-list">
                  {problems.map((p) => (
                    <li key={p.id}>
                      <button
                        className={
                          "inbox-item" + (p.id === selectedId ? " selected" : "")
                        }
                        onClick={() => selectProblem(p.id)}
                      >
                        <span className="inbox-title">
                          <span>{p.title}</span>
                          {p.status === "Submitted" ? (
                            <span className="check">✓</span>
                          ) : (
                            <span className="dot"></span>
                          )}
                        </span>
                        <span className="inbox-meta">
                          From {p.from} · {p.when} · {p.mins} min
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <div className="rail">
                <button
                  className="icon-btn"
                  onClick={() => setInboxOpen(true)}
                  aria-expanded="false"
                  aria-label="Expand problems list"
                  title="Show problems"
                >
                  ›
                </button>
                {problems.map((p, i) => (
                  <button
                    key={p.id}
                    className={
                      "rail-item" + (p.id === selectedId ? " selected" : "")
                    }
                    onClick={() => selectProblem(p.id)}
                    title={p.title}
                  >
                    {p.status === "Submitted" ? "✓" : i + 1}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* RIGHT: the selected problem */}
          <div className="work">
            <div className="card problem-card">
              <div className="problem-top">
                <div>
                  <div className="title-row">
                    <h2>{problem.title}</h2>
                    <span className="tag">{problem.concept}</span>
                    <span className="tag">Live</span>
                  </div>
                  <p className="sent-by">
                    <span className="dot"></span>
                    Sent by {problem.from} · {problem.when}
                  </p>
                </div>
                <div className="clock-box">
                  <p>Time left of {problem.mins} min</p>
                  <p className="clock">{formatTime(problem.left)}</p>
                </div>
              </div>
              <p className="statement">{problem.statement}</p>
              <p className="share-note">
                Share your screen in Google Meet so your mentor can follow
                along.
              </p>
            </div>

            <div className="editor-column">
              <div className="editor-card">
                <div className="editor-header">
                  <span className="file-name">{problem.functionName}.js</span>
                  <div className="editor-actions">
                    <button
                      className="btn btn-run"
                      onClick={runCode}
                      disabled={isSubmitted}
                    >
                      Run ▶
                    </button>
                    <button
                      className="btn btn-run"
                      onClick={runAllTests}
                      disabled={isSubmitted}
                    >
                      Run tests
                    </button>
                    <button
                      className="btn btn-submit"
                      onClick={submit}
                      disabled={isSubmitted}
                    >
                      {isSubmitted ? "Submitted" : "Submit"}
                    </button>
                  </div>
                </div>

                {/* drag the bottom-right corner of this box to make the editor taller */}
                <div className="editor-body">
                  <Editor
                    height="100%"
                    theme="indigo-night"
                    defaultLanguage="javascript"
                    beforeMount={setupTheme}
                    onMount={handleMount}
                    value={problem.code}
                    onChange={(value) =>
                      updateProblem(problem.id, { code: value })
                    }
                    options={{
                      fontFamily: '"DM Mono", monospace',
                      fontSize: 14,
                      minimap: { enabled: false },
                      padding: { top: 16 },
                      scrollBeyondLastLine: false,
                      automaticLayout: true,
                      readOnly: isSubmitted,
                    }}
                  />
                </div>

                {/* test cases and console, at the bottom of the editor like v2 */}
                <div className="test-panel">
                  <div className="test-heading">
                    <button
                      className={bottomTab === "tests" ? "active" : ""}
                      onClick={() => setBottomTab("tests")}
                    >
                      Test cases
                    </button>
                    <button
                      className={bottomTab === "console" ? "active" : ""}
                      onClick={() => setBottomTab("console")}
                    >
                      Console
                    </button>
                    <span className="test-count">
                      {problem.testResults
                        ? passedCount + "/" + problem.tests.length + " passed"
                        : "Not run yet"}
                    </span>
                  </div>

                  {bottomTab === "tests" ? (
                    <div className="test-body">
                      <div className="test-tabs">
                        {problem.tests.map((test, i) => {
                          const result = problem.testResults
                            ? problem.testResults[i]
                            : null;
                          return (
                            <button
                              key={i}
                              className={activeCase === i ? "active" : ""}
                              onClick={() => setActiveCase(i)}
                            >
                              Case {i + 1}
                              {result && (result.passed ? " ✓" : " ✕")}
                            </button>
                          );
                        })}
                      </div>

                      <div className="test-values">
                        <div>
                          <span>Input</span>
                          <code>
                            {formatInput(activeTest.input, problem.params)}
                          </code>
                        </div>
                        <div>
                          <span>Expected</span>
                          <code>{show(activeTest.expected)}</code>
                        </div>
                        {activeResult && (
                          <div>
                            <span>Output</span>
                            <code
                              className={
                                activeResult.passed
                                  ? "output-success"
                                  : "output-fail"
                              }
                            >
                              {activeResult.shown}
                            </code>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="test-body console-lines">
                      {problem.consoleLines.length === 0 ? (
                        <div>Press Run to see what your code prints</div>
                      ) : (
                        problem.consoleLines.map((line, i) => (
                          <div key={i}>&gt; {line}</div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>

              {isSubmitted ? (
                <p className="status-line">
                  <strong className="pass">Submitted.</strong> Your mentor can
                  see your solution: {problem.result}.
                </p>
              ) : (
                <p className="status-line">
                  {problem.left === 0
                    ? "Time is up. Submit what you have."
                    : "Not submitted yet. Submit before the time runs out."}
                </p>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
