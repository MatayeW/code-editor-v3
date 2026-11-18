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

// ["level up"] becomes "level up", [[1, 2]] becomes [1,2]
function formatInput(input) {
  return input.map((arg) => show(arg)).join(", ");
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
      code: p.starterCode,
      left: p.mins * 60, // seconds left on the clock
      status: p.submittedResult ? "Submitted" : "Solving",
      result: p.submittedResult || "",
      testResults: null,
      consoleLines: [],
    }))
  );
  const [selectedId, setSelectedId] = useState(liveProblems[0].id);

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
  const passedCount = problem.testResults
    ? problem.testResults.filter((r) => r.passed).length
    : 0;

  // change some fields on one problem
  function updateProblem(id, changes) {
    setProblems((current) =>
      current.map((p) => (p.id === id ? { ...p, ...changes } : p))
    );
  }

  // Run: show what the code prints
  function runCode() {
    updateProblem(problem.id, { consoleLines: captureConsole(problem.code) });
  }

  // Run tests: check the code against the test cases
  function runAllTests() {
    updateProblem(problem.id, {
      testResults: runTests(problem.code, problem.functionName, problem.tests),
    });
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

        <div className="live-layout">
          {/* LEFT: problems received */}
          <div className="card">
            <div className="card-heading">
              <h2>Problems received</h2>
            </div>
            <ul className="inbox-list">
              {problems.map((p) => (
                <li key={p.id}>
                  <button
                    className={
                      "inbox-item" + (p.id === selectedId ? " selected" : "")
                    }
                    onClick={() => setSelectedId(p.id)}
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

            <div className="work-grid">
              {/* editor */}
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

                  <div className="console">
                    <p className="console-title">Console</p>
                    <div className="console-lines">
                      {problem.consoleLines.length === 0 ? (
                        <div>Press Run to see what your code prints</div>
                      ) : (
                        problem.consoleLines.map((line, i) => (
                          <div key={i}>&gt; {line}</div>
                        ))
                      )}
                    </div>
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

              {/* test results */}
              <div className="card">
                <div className="card-heading">
                  <h3>Test Results</h3>
                  <span className="count">
                    {problem.testResults
                      ? passedCount + "/" + problem.tests.length + " passed"
                      : "Not run yet"}
                  </span>
                </div>
                <ul className="test-list">
                  {problem.tests.map((test, i) => {
                    const result = problem.testResults
                      ? problem.testResults[i]
                      : null;
                    return (
                      <li className="test-item" key={i}>
                        <span
                          className={
                            "test-mark " +
                            (result ? (result.passed ? "pass" : "fail") : "")
                          }
                        >
                          {result ? (result.passed ? "✓" : "✕") : "○"}
                        </span>
                        <div>
                          <span className="code">
                            {problem.functionName}({formatInput(test.input)}) →{" "}
                            {show(test.expected)}
                          </span>
                          {result && !result.passed && (
                            <span className="test-detail">
                              Got {result.shown}
                            </span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

export default App;
