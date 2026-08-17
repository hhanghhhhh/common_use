importPackage(Packages.com.ti.debug.engine.scripting);
importPackage(Packages.com.ti.ccstudio.scripting.environment);
importPackage(Packages.java.lang);

if (arguments.length < 3) {
    System.out.println("[CCS-DSS] ERROR: usage: dss_verify_monotonic.js <ccxml> <program> <expression> [sample_ms]");
    System.exit(2);
}

var ccxml = arguments[0];
var program = arguments[1];
var expression = arguments[2];
var sampleMs = arguments.length > 3 ? parseInt(arguments[3], 10) : 1000;

if (isNaN(sampleMs) || sampleMs <= 0) {
    System.out.println("[CCS-DSS] ERROR: sample_ms must be a positive integer");
    System.exit(2);
}

var env = ScriptingEnvironment.instance();
var server = null;
var session = null;
var passed = false;

function log(message) {
    System.out.println("[CCS-DSS] " + message);
}

try {
    env.setScriptTimeout(300000);
    server = env.getServer("DebugServer.1");
    server.setConfig(ccxml);

    // 已验证：当 ccxml 只暴露一个目标时，优先使用无参数 openSession()。
    // 多核目标必须根据当前工程显式选择正确 session。
    session = server.openSession();
    session.target.connect();

    session.options.setBoolean("AddCIOBreakpointAfterLoad", false);
    session.options.setBoolean("AddCEXITbreakpointAfterLoad", false);
    session.options.setBoolean("AutoRunToLabelOnRestart", false);
    session.options.setString("VerifyAfterProgramLoad", "Full verification");

    session.memory.loadProgram(program);
    log("Program load completed.");

    session.target.runAsynch();
    Thread.sleep(sampleMs);

    var first = Number(session.expression.evaluate(expression));
    log(expression + " sample 1 = " + first);

    var current = first;
    var sampleNumber = 2;

    while (current <= first && sampleNumber <= 6) {
        Thread.sleep(sampleMs);
        current = Number(session.expression.evaluate(expression));
        log(expression + " sample " + sampleNumber + " = " + current);
        sampleNumber++;
    }

    if (current > first) {
        log("PASS: expression increased by " + (current - first));
        passed = true;
    } else {
        log("FAIL: expression did not increase within the sample window");
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
                session.target.disconnect();
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
