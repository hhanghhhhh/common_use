importPackage(Packages.com.ti.debug.engine.scripting);
importPackage(Packages.com.ti.ccstudio.scripting.environment);
importPackage(Packages.java.lang);

if (arguments.length < 9) {
    System.out.println("[CCS-DSS] ERROR: usage: dss_verify_state_machine.js <ccxml> <program> <state_expr> <pass_state> <fail_state> <pass_flag_expr> <error_expr> <progress_expr_or_dash> <expected_progress> [sample_ms] [timeout_ms] [startup_grace_samples]");
    System.exit(2);
}

var ccxml = arguments[0];
var program = arguments[1];
var stateExpr = arguments[2];
var passState = Number(arguments[3]);
var failState = Number(arguments[4]);
var passFlagExpr = arguments[5];
var errorExpr = arguments[6];
var progressExpr = arguments[7];
var expectedProgress = Number(arguments[8]);
var sampleMs = arguments.length > 9 ? parseInt(arguments[9], 10) : 500;
var timeoutMs = arguments.length > 10 ? parseInt(arguments[10], 10) : 10000;
var startupGraceSamples = arguments.length > 11 ? parseInt(arguments[11], 10) : 1;
var checkProgress = progressExpr !== "-";

function log(message) {
    System.out.println("[CCS-DSS] " + message);
}

if (isNaN(passState) || isNaN(failState) || isNaN(expectedProgress) ||
    isNaN(sampleMs) || sampleMs <= 0 ||
    isNaN(timeoutMs) || timeoutMs <= 0 ||
    isNaN(startupGraceSamples) || startupGraceSamples < 0) {
    log("ERROR: states/expected_progress must be numeric, sample_ms/timeout_ms must be positive integers, and startup_grace_samples must be a non-negative integer");
    System.exit(2);
}

var env = ScriptingEnvironment.instance();
var server = null;
var session = null;
var passed = false;
var terminal = false;
var loaded = false;

function readNumber(expression) {
    var raw = session.expression.evaluate(expression);
    if (raw === null || typeof raw === "undefined") {
        throw new Error("expression returned no value: " + expression);
    }

    var text = String(raw);
    if (text.replace(/\s+/g, "") === "") {
        throw new Error("expression returned an empty value: " + expression);
    }

    var value = Number(raw);
    if (isNaN(value) || !isFinite(value)) {
        throw new Error("expression is not a finite numeric value: " + expression + " raw=" + text);
    }
    return value;
}

try {
    env.setScriptTimeout(300000);
    server = env.getServer("DebugServer.1");
    server.setConfig(ccxml);
    session = server.openSession();
    log("SESSION_OPEN");
    session.target.connect();
    log("TARGET_CONNECTED");

    session.options.setBoolean("AddCIOBreakpointAfterLoad", false);
    session.options.setBoolean("AddCEXITbreakpointAfterLoad", false);
    session.options.setBoolean("AutoRunToLabelOnRestart", false);
    session.options.setString("VerifyAfterProgramLoad", "Full verification");
    session.memory.loadProgram(program);
    loaded = true;
    log("PROGRAM_LOADED=" + program);
    log("STARTUP_GRACE_SAMPLES=" + startupGraceSamples);

    var maxSamples = Math.max(1, Math.ceil(timeoutMs / sampleMs));
    for (var sample = 1; sample <= maxSamples && !terminal; sample++) {
        session.target.runAsynch();
        Thread.sleep(sampleMs);
        session.target.halt();

        var state = readNumber(stateExpr);
        var passFlag = readNumber(passFlagExpr);
        var error = readNumber(errorExpr);
        var progress = checkProgress ? readNumber(progressExpr) : 0;
        log("SAMPLE=" + sample + " state=" + state + " pass=" + passFlag +
            " error=" + error + (checkProgress ? " progress=" + progress : ""));

        if (state === passState) {
            terminal = true;
            passed = passFlag === 1 && error === 0 &&
                     (!checkProgress || progress === expectedProgress);
        } else if (state === failState) {
            if (sample <= startupGraceSamples) {
                log("STARTUP_GRACE: ignoring FAIL_STATE on sample " + sample);
            } else {
                terminal = true;
                passed = false;
            }
        }
    }

    if (passed) {
        log("PASS: state machine reached the expected terminal state with matching evidence");
    } else if (terminal) {
        log("FAIL: state machine reached a terminal state but evidence did not match");
    } else {
        log("FAIL: state machine did not reach a terminal state within " + timeoutMs + " ms");
    }
} catch (err) {
    log("ERROR: " + err);
    if (err.javaException) {
        log("DETAIL: " + err.javaException.getMessage());
    }
} finally {
    try {
        if (session !== null) {
            if (session.target.isConnected()) {
                if (passed && loaded) {
                    session.target.runAsynch();
                    log("FINAL_TARGET_STATE=running");
                } else {
                    log("FINAL_TARGET_STATE=halted_or_unknown");
                }
                session.target.disconnect();
                log("TARGET_DISCONNECTED");
            }
            session.terminate();
        }
    } catch (cleanupError) {
        log("Cleanup warning: " + cleanupError);
    }

    try {
        if (server !== null) {
            server.stop();
        }
    } catch (serverError) {
        log("Server cleanup warning: " + serverError);
    }
}

System.exit(passed ? 0 : 1);
