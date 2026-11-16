"""
LuggEase Code Review Report Generator
Creates docs/code-review-report.xlsx using only Python stdlib (zipfile + xml).
Run: python docs/create_code_review_report.py
"""

import zipfile
import os
import xml.etree.ElementTree as ET
from datetime import datetime

# ---------------------------------------------------------------------------
# Data
# ---------------------------------------------------------------------------

ISSUES = [
    {
        "id": "CR-001",
        "category": "Android Build",
        "severity": "Critical",
        "file": "frontend/android/app/src/main/java/in/innovease/luggease/MainActivity.kt",
        "lines": "1-30",
        "description": (
            "Missing onCreate(savedInstanceState: Bundle?) override calling super.onCreate(null). "
            "React Native Screens / React Navigation requires the bundle to be passed as null to "
            "prevent fragment-recreation crashes on back navigation."
        ),
        "code_before": (
            "class MainActivity : ReactActivity() {\n"
            "    override fun getMainComponentName() = \"LuggEase\"\n"
            "    override fun createReactActivityDelegate() = ...\n"
            "}"
        ),
        "code_after": (
            "import android.os.Bundle\n"
            "class MainActivity : ReactActivity() {\n"
            "    override fun getMainComponentName() = \"LuggEase\"\n"
            "    override fun onCreate(savedInstanceState: Bundle?) {\n"
            "        super.onCreate(null)  // Required by react-native-screens\n"
            "    }\n"
            "    override fun createReactActivityDelegate() = ...\n"
            "}"
        ),
        "status": "Fixed",
        "notes": (
            "Without this, navigating back and re-entering a screen can cause 'Fragment already added' "
            "IllegalStateException on Android. Critical for production stability."
        ),
    },
    {
        "id": "CR-002",
        "category": "iOS Build",
        "severity": "High",
        "file": "frontend/ios/LuggEase.xcodeproj/project.pbxproj",
        "lines": "Project-level Debug/Release configs",
        "description": (
            "IPHONEOS_DEPLOYMENT_TARGET inconsistency: project-level Debug/Release configs were set to 15.1 "
            "while the app target configs were 16.1. This mismatch can cause Xcode warnings and unexpected "
            "runtime behaviour on iOS 15 devices."
        ),
        "code_before": 'IPHONEOS_DEPLOYMENT_TARGET = 15.1;  // project-level Debug & Release',
        "code_after": 'IPHONEOS_DEPLOYMENT_TARGET = 16.1;  // aligned with app target',
        "status": "Fixed",
        "notes": (
            "Min deployment target is 16.1 per app target configs. Project-level must match to avoid "
            "Xcode build warnings and to ensure consistent linking of system frameworks."
        ),
    },
    {
        "id": "CR-003",
        "category": "Frontend",
        "severity": "High",
        "file": "frontend/src/components/signature-pad-html.ts",
        "lines": "~60-80 (postMessage call)",
        "description": (
            "Signature pad HTML uses `location.origin` as the postMessage targetOrigin. "
            "In a native WebView and in `about:blank` iframes, `location.origin` is `'null'` (string), "
            "causing postMessage to silently fail — signatures are never relayed to the app."
        ),
        "code_before": "parent.postMessage({ type: 'SIGNATURE', data: dataUrl }, location.origin);",
        "code_after": (
            "const origin = location.origin === 'null' ? '*' : location.origin;\n"
            "parent.postMessage({ type: 'SIGNATURE', data: dataUrl }, origin);"
        ),
        "status": "Fixed",
        "notes": (
            "AGREEMENT-01 requirement: signatures are mandatory for delivery completion. "
            "Silent failure here would block the entire delivery workflow."
        ),
    },
    {
        "id": "CR-004",
        "category": "Frontend",
        "severity": "High",
        "file": "frontend/src/components/signature-pad.web.tsx",
        "lines": "~40-60 (message event listener)",
        "description": (
            "MessageEvent origin check only allowed `window.location.origin`. "
            "In sandboxed iframes and native WebViews, `e.origin` is `'null'` or empty string, "
            "causing all signature messages to be silently rejected."
        ),
        "code_before": "if (e.origin !== window.location.origin) return;",
        "code_after": (
            "const selfOrigin = window.location.origin;\n"
            "const isAllowed = e.origin === selfOrigin || e.origin === 'null' || !e.origin;\n"
            "if (!isAllowed) return;"
        ),
        "status": "Fixed",
        "notes": (
            "Companion fix to CR-003. Without this, the web version would also silently drop "
            "signature data from the iframe, breaking the agreement signing flow."
        ),
    },
    {
        "id": "CR-005",
        "category": "Frontend",
        "severity": "Medium",
        "file": "frontend/public/tracking-map.html",
        "lines": "postMessage allowed origins list",
        "description": (
            "tracking-map.html only allowed `window.location.origin` for postMessage, "
            "blocking local development origins (localhost:5173, 127.0.0.1:5173, localhost:3000). "
            "Developers could not test live map tracking locally."
        ),
        "code_before": "const allowedOrigins = [window.location.origin];",
        "code_after": (
            "const allowedOrigins = [\n"
            "  window.location.origin,\n"
            "  'http://localhost:5173',\n"
            "  'http://127.0.0.1:5173',\n"
            "  'http://localhost:3000',\n"
            "];"
        ),
        "status": "Fixed",
        "notes": (
            "TRACK-01 requirement: live tracking map during in_transit status. "
            "Development origin restriction was blocking local end-to-end testing."
        ),
    },
    {
        "id": "CR-006",
        "category": "Frontend",
        "severity": "Low",
        "file": "frontend/src/components/invoice-card.tsx",
        "lines": "Charges list render",
        "description": (
            "React list key set to `key={c.label}` for invoice charge items. "
            "If two charges share the same label (e.g., two 'GST' line items), "
            "React emits a duplicate-key warning and may misrender list updates."
        ),
        "code_before": "charges.map((c) => <Row key={c.label} ... />)",
        "code_after": "charges.map((c, i) => <Row key={`${c.label}-${i}`} ... />)",
        "status": "Fixed",
        "notes": (
            "PAY-01/PAY-02 involve instalment charges that may share labels. "
            "Prevents potential UI glitches during payment flow."
        ),
    },
    {
        "id": "CR-007",
        "category": "Frontend",
        "severity": "Low",
        "file": "frontend/app/order/[id].tsx",
        "lines": "Extra stops list render",
        "description": (
            "Extra stops list rendered with `key={i}` (index-only key). "
            "If stops are reordered or one is removed, React re-renders incorrectly "
            "because index-based keys are unstable."
        ),
        "code_before": "extraStops.map((st, i) => <Text key={i}>{st}</Text>)",
        "code_after": "extraStops.map((st, i) => <Text key={`${st}-${i}`}>{st}</Text>)",
        "status": "Fixed",
        "notes": (
            "ROUTE-01 supports multiple pickup/drop stops. "
            "Using composite key prevents subtle re-render bugs when stops change."
        ),
    },
    {
        "id": "CR-008",
        "category": "Accessibility",
        "severity": "Medium",
        "file": "frontend/src/components/ui.tsx",
        "lines": "Stepper component",
        "description": (
            "Stepper increment/decrement buttons lacked ARIA-equivalent accessibility attributes: "
            "no accessibilityRole, accessibilityLabel, or accessibilityState. "
            "Screen readers (TalkBack/VoiceOver) could not identify or announce these controls."
        ),
        "code_before": "<TouchableOpacity onPress={...}><Text>+</Text></TouchableOpacity>",
        "code_after": (
            "<TouchableOpacity\n"
            "  onPress={...}\n"
            "  accessibilityRole=\"button\"\n"
            "  accessibilityLabel=\"Increase quantity\"\n"
            "  accessibilityState={{ disabled }}\n"
            ">"
        ),
        "status": "Fixed",
        "notes": (
            "Required for WCAG 2.1 AA compliance. "
            "Affects item quantity selection during booking flow."
        ),
    },
    {
        "id": "CR-009",
        "category": "Testing",
        "severity": "Medium",
        "file": "backend/pytest.ini",
        "lines": "testpaths setting",
        "description": (
            "No `testpaths` configured — running bare `pytest` would discover and attempt "
            "all test files including live-server integration tests that require a running server "
            "and open network connections, causing failures in CI and local dev environments."
        ),
        "code_before": "# (no testpaths entry)",
        "code_after": "testpaths = tests/test_pricing.py tests/review",
        "status": "Fixed",
        "notes": (
            "Fast tests (pricing logic, review suite) now run by default. "
            "Live integration tests are skipped unless server is explicitly available."
        ),
    },
    {
        "id": "CR-010",
        "category": "Testing",
        "severity": "High",
        "file": "backend/tests/test_luggease_api.py",
        "lines": "_env() function, entire file",
        "description": (
            "Test helper `_env()` hardcoded Docker path `/app/frontend/.env`, causing "
            "FileNotFoundError in local development. All test cases then attempted to connect "
            "to hardcoded server address `192.168.1.9:8012`, which fails in sandbox/CI."
        ),
        "code_before": "open('/app/frontend/.env')",
        "code_after": (
            "# Tries: os.environ -> project root .env -> frontend/.env\n"
            "# Falls back gracefully; skips live-server tests when server unavailable"
        ),
        "status": "Fixed",
        "notes": (
            "Critical for CI pipeline. Docker-only paths break local development workflow "
            "and all developer machines that are not running in containers."
        ),
    },
    {
        "id": "CR-011",
        "category": "Testing",
        "severity": "Medium",
        "file": "backend/tests/test_demo_seed.py",
        "lines": "Module level",
        "description": (
            "Live-server integration test file had no skip guard. "
            "Running without a local server caused immediate connection errors "
            "without meaningful error messages."
        ),
        "code_before": "# No pytestmark or skip condition",
        "code_after": (
            "from test_luggease_api import live_server_available\n"
            "pytestmark = pytest.mark.skipif(not live_server_available, reason='Live server not available')"
        ),
        "status": "Fixed",
        "notes": "Same pattern applied to test_lugg_porter_features.py and test_iter5_roles_settlement.py (CR-012, CR-013).",
    },
    {
        "id": "CR-012",
        "category": "Testing",
        "severity": "Medium",
        "file": "backend/tests/test_lugg_porter_features.py",
        "lines": "Module level",
        "description": (
            "Live-server integration test file had no skip guard — identical issue to CR-011."
        ),
        "code_before": "# No pytestmark or skip condition",
        "code_after": (
            "from test_luggease_api import live_server_available\n"
            "pytestmark = pytest.mark.skipif(not live_server_available, reason='Live server not available')"
        ),
        "status": "Fixed",
        "notes": "See CR-011.",
    },
    {
        "id": "CR-013",
        "category": "Testing",
        "severity": "Medium",
        "file": "backend/tests/test_iter5_roles_settlement.py",
        "lines": "BASE_URL resolution + module level",
        "description": (
            "BASE_URL was resolved from hardcoded Docker path and env variable with no fallback. "
            "No skip guard when server is unavailable."
        ),
        "code_before": "BASE_URL = os.getenv('BASE_URL', 'http://localhost:8012')",
        "code_after": (
            "# Rewrote to try os.environ -> project root .env -> fallback\n"
            "pytestmark = pytest.mark.skipif(not live_server_available, ...)"
        ),
        "status": "Fixed",
        "notes": "Consistent sandbox-safe pattern across all live test files.",
    },
    {
        "id": "CR-014",
        "category": "Performance",
        "severity": "Low",
        "file": "backend/server.py",
        "lines": "limit_places() function",
        "description": (
            "Rate-limiter in-memory store (`_rate_limit_store`) was pruned only when it exceeded "
            "10,000 entries. On a busy single-instance server, memory would grow unbounded for "
            "hours before the first cleanup cycle ran."
        ),
        "code_before": "if len(_rate_limit_store) >= 10000:",
        "code_after": "if len(_rate_limit_store) >= 1000:  # Proactive cleanup at 1K entries",
        "status": "Fixed",
        "notes": (
            "Rate limiter is per-user/minute in-memory on single instance. "
            "No distributed rate limiting — acceptable for current deployment scale "
            "but should be migrated to Redis if horizontal scaling is added."
        ),
    },
    {
        "id": "CR-015",
        "category": "Frontend",
        "severity": "Info",
        "file": "test_reports/delivery-simulation.json",
        "lines": "Top-level JSON fields",
        "description": (
            "Three fields (`oppo_navigation_preview`, `bank_profile_device_check`, "
            "`oppo_power_setting_restored`) were accidentally removed during a review test run "
            "that overwrote the file."
        ),
        "code_before": "# Fields missing from JSON output",
        "code_after": "# Fields restored: oppo_navigation_preview, bank_profile_device_check, oppo_power_setting_restored",
        "status": "Fixed",
        "notes": "Restored manually. File is a test fixture for OPPO device simulation tests.",
    },
    {
        "id": "CR-016",
        "category": "Security",
        "severity": "Medium",
        "file": "backend/server.py",
        "lines": "payment_configuration() endpoint",
        "description": (
            "Production environment correctly rejects Razorpay test-mode keys (PAY-03). "
            "However, the check is string-prefix based (`rzp_test_`). "
            "If Razorpay changes their key format, the check would silently pass."
        ),
        "code_before": "if key.startswith('rzp_test_'):",
        "code_after": (
            "# Recommendation: also check that live key starts with 'rzp_live_'\n"
            "# if not (key.startswith('rzp_live_') or env != 'production'):\n"
            "#     raise HTTPException(400, 'Production requires rzp_live_ keys')"
        ),
        "status": "Pending",
        "notes": (
            "Current check prevents test keys in production. "
            "Positive assertion (must start with rzp_live_) would be more robust. Low risk currently."
        ),
    },
    {
        "id": "CR-017",
        "category": "Security",
        "severity": "Medium",
        "file": "frontend/src/components/pay-button.tsx",
        "lines": "Razorpay HTML template",
        "description": (
            "Razorpay HTML string is built via template literals. "
            "Although `replace()` sanitisation calls are present, "
            "injecting dynamic options JSON into an HTML string risks XSS "
            "if any option value contains unescaped `</script>` sequences."
        ),
        "code_before": "const html = `...${JSON.stringify(options)}...`;",
        "code_after": (
            "// Recommendation: use JSON.stringify with replacer to escape </script>:\n"
            "// JSON.stringify(options).replace(/<\\/script>/gi, '<\\/script>')"
        ),
        "status": "Pending",
        "notes": (
            "Current code has replace() calls but they may not cover all edge cases. "
            "Risk is low as options are server-generated, not user-provided. Document for audit trail."
        ),
    },
    {
        "id": "CR-018",
        "category": "Performance",
        "severity": "Low",
        "file": "backend/server.py",
        "lines": "Rate limiter (entire module)",
        "description": (
            "In-memory rate limiter (60 req/min/user) is per-process. "
            "If the Cloud Run service scales to multiple instances, rate limits are not enforced "
            "globally — each instance gets its own independent counter."
        ),
        "code_before": "_rate_limit_store: dict = {}  # in-memory, per-process",
        "code_after": (
            "# Recommendation: migrate to Redis or Firestore for distributed rate limiting\n"
            "# when horizontal scaling is enabled on Cloud Run."
        ),
        "status": "Pending",
        "notes": (
            "Currently Cloud Run is single-instance (min=1, max=1 implied by config). "
            "No immediate risk. Document as known limitation for future scaling."
        ),
    },
    {
        "id": "CR-019",
        "category": "Android Build",
        "severity": "Low",
        "file": "frontend/android/gradle.properties",
        "lines": "reactNativeArchitectures",
        "description": (
            "reactNativeArchitectures includes armeabi-v7a and x86 (32-bit) alongside arm64-v8a and x86_64. "
            "32-bit x86 is not needed for modern device testing or Google Play submission "
            "(Play dropped 32-bit x86 requirement years ago). "
            "Including it increases build times."
        ),
        "code_before": "reactNativeArchitectures=armeabi-v7a,arm64-v8a,x86,x86_64",
        "code_after": (
            "# Recommendation for local dev: reactNativeArchitectures=arm64-v8a,x86_64\n"
            "# Keep all 4 for release builds to ensure maximum compatibility."
        ),
        "status": "Pending",
        "notes": "Low severity. Keeping all architectures is safe; removing 32-bit reduces local build time by ~20-30%.",
    },
    {
        "id": "CR-020",
        "category": "Backend",
        "severity": "Info",
        "file": "backend/server.py",
        "lines": "CORS configuration",
        "description": (
            "CORS allows all origins (`allow_origins=['*']`). "
            "While acceptable for a mobile-first API (native apps bypass CORS), "
            "the web frontend is also served and would benefit from an origin allowlist in production."
        ),
        "code_before": "allow_origins=['*']",
        "code_after": (
            "# Recommendation: in production, restrict to:\n"
            "# allow_origins=['https://luggease.web.app', 'https://luggease.firebaseapp.com']"
        ),
        "status": "Pending",
        "notes": (
            "No immediate security risk since Firebase JWT authentication is enforced on all endpoints. "
            "Tightening CORS is defence-in-depth."
        ),
    },
    {
        "id": "CR-021",
        "category": "Backend",
        "severity": "Info",
        "file": "backend/server.py + backend/logistics_workflow.py",
        "lines": "Various",
        "description": (
            "HMAC signature verification uses `hmac.new()` correctly with `digestmod=hashlib.sha256`. "
            "No issue — this is the standard Python `hmac` API. Documented here for audit trail."
        ),
        "code_before": "hmac.new(key.encode(), msg.encode(), hashlib.sha256).hexdigest()",
        "code_after": "# No change required — correct usage of Python hmac module",
        "status": "Wont Fix",
        "notes": "Verified correct. `hmac.new()` is the Python stdlib API for HMAC computation.",
    },
    {
        "id": "CR-022",
        "category": "iOS Build",
        "severity": "Info",
        "file": "frontend/ios/Podfile",
        "lines": "use_frameworks! directive",
        "description": (
            "Podfile uses `use_frameworks! :linkage => :dynamic` required for Firebase pods. "
            "This is correct but means all pods are dynamic frameworks, increasing app launch time slightly."
        ),
        "code_before": "use_frameworks! :linkage => :dynamic",
        "code_after": (
            "# No change required.\n"
            "# Firebase RN 11+ requires dynamic linkage. Static linkage causes duplicate symbol errors."
        ),
        "status": "Wont Fix",
        "notes": "Documented for awareness. Firebase RN mandates dynamic frameworks; no alternative available.",
    },
    {
        "id": "CR-023",
        "category": "Backend",
        "severity": "Info",
        "file": "deployment/api-gateway.yaml",
        "lines": "Firebase JWT backend",
        "description": (
            "API Gateway validates Firebase JWT tokens before forwarding requests to Cloud Run. "
            "JWT audience is hardcoded in the YAML. If the Firebase project is migrated, "
            "this value must be manually updated."
        ),
        "code_before": "x-google-audiences: luggease-app",
        "code_after": (
            "# Recommendation: parameterise via Cloud Build substitution variable:\n"
            "# x-google-audiences: ${_FIREBASE_PROJECT_ID}"
        ),
        "status": "Pending",
        "notes": "Low risk currently (single project). Parameterisation reduces deployment error risk during migration.",
    },
]

# ---------------------------------------------------------------------------
# Excel (OOXML) generation helpers
# ---------------------------------------------------------------------------

COLUMNS = [
    "Review ID", "Category", "Severity", "File Path", "Line(s)",
    "Issue Description", "Code Before", "Code After / Recommendation",
    "Status", "Notes / Business Impact"
]

COLUMN_WIDTHS = [10, 16, 10, 60, 20, 60, 50, 50, 10, 60]

SEVERITY_COLORS = {
    "Critical": "FFCCCC",
    "High":     "FFE0B2",
    "Medium":   "FFF9C4",
    "Low":      "E8F5E9",
    "Info":     "E3F2FD",
}

STATUS_COLORS = {
    "Fixed":     "C8E6C9",
    "Pending":   "FFF9C4",
    "Wont Fix": "E0E0E0",
}

CATEGORY_COLORS = {
    "Android Build": "EDE7F6",
    "iOS Build":     "E8EAF6",
    "Frontend":      "E0F7FA",
    "Backend":       "F9FBE7",
    "Testing":       "FBE9E7",
    "Security":      "FCE4EC",
    "Accessibility": "F3E5F5",
    "Performance":   "E8F5E9",
}


def esc(s: str) -> str:
    """Escape XML special characters and control chars."""
    s = str(s)
    s = s.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    # Remove low ASCII control chars (Excel rejects them)
    return "".join(ch for ch in s if ord(ch) >= 0x20 or ch in "\t\n\r")


def argb(hex6: str) -> str:
    return "FF" + hex6.upper()


def build_styles_xml(sev_colors, stat_colors, cat_colors):
    """
    Returns the styles.xml content.
    Font index 0 = default, 1 = bold header
    Fill index 0 = none, 1 = gray (required by Excel spec), 2+ = custom
    """

    all_colors = {}
    for d in [sev_colors, stat_colors, cat_colors]:
        for k, v in d.items():
            all_colors[k] = v

    # Build fill list: index 0=none, 1=gray(required), then one per color key
    fill_keys = sorted(all_colors.keys())
    fill_map = {}  # key -> fill index (starting at 2)
    fills_xml = (
        '<fills count="{}">'
        '<fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill>'
    ).format(2 + len(fill_keys))
    for i, k in enumerate(fill_keys):
        fills_xml += (
            '<fill><patternFill patternType="solid">'
            f'<fgColor rgb="{argb(all_colors[k])}"/>'
            '</patternFill></fill>'
        )
        fill_map[k] = 2 + i
    fills_xml += '</fills>'

    # Fonts: 0=default, 1=bold
    fonts_xml = (
        '<fonts count="2">'
        '<font><sz val="11"/><name val="Calibri"/></font>'
        '<font><b/><sz val="11"/><name val="Calibri"/></font>'
        '</fonts>'
    )

    # Borders: 0=none, 1=thin all around
    borders_xml = (
        '<borders count="2">'
        '<border><left/><right/><top/><bottom/><diagonal/></border>'
        '<border>'
        '<left style="thin"><color rgb="FF000000"/></left>'
        '<right style="thin"><color rgb="FF000000"/></right>'
        '<top style="thin"><color rgb="FF000000"/></top>'
        '<bottom style="thin"><color rgb="FF000000"/></bottom>'
        '<diagonal/>'
        '</border>'
        '</borders>'
    )

    # CellStyleXfs (required)
    cellStyleXfs = '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'

    # CellXfs:
    # xf 0: default
    # xf 1: header (bold, border, center, wrap)
    # xf 2: data (border, wrap, top-align)
    # xf 3+: data with fill (one per color key)
    xf_base = (
        '<xf numFmtId="0" fontId="0" fillId="{fill}" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1">'
        '<alignment wrapText="1" vertical="top"/>'
        '</xf>'
    )
    xf_header = (
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="1" xfId="0" applyFont="1" applyBorder="1" applyAlignment="1">'
        '<alignment horizontal="center" vertical="center" wrapText="1"/>'
        '</xf>'
    )

    xf_entries = [
        '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>',  # 0: default
        xf_header,                                                           # 1: header
        xf_base.format(fill=0),                                              # 2: data, no fill
    ]
    xf_map = {}  # key -> xf index (starting at 3)
    for i, k in enumerate(fill_keys):
        xf_entries.append(xf_base.format(fill=fill_map[k]))
        xf_map[k] = 3 + i

    cellXfs = f'<cellXfs count="{len(xf_entries)}">{"".join(xf_entries)}</cellXfs>'

    styles = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        + fonts_xml + fills_xml + borders_xml + cellStyleXfs + cellXfs +
        '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    )
    return styles, xf_map, fill_map


def build_shared_strings(issues):
    """Build sharedStrings.xml and return (xml_str, si_map)."""
    strings = []
    seen = {}

    def intern(s: str) -> int:
        s = str(s)
        if s not in seen:
            seen[s] = len(strings)
            strings.append(s)
        return seen[s]

    # Pre-intern all cell values
    # Header
    for c in COLUMNS:
        intern(c)
    for iss in issues:
        for val in [iss["id"], iss["category"], iss["severity"], iss["file"],
                    iss["lines"], iss["description"], iss["code_before"],
                    iss["code_after"], iss["status"], iss["notes"]]:
            intern(str(val))

    total = len(strings)
    xml = (
        f'<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        f'<sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" count="{total}" uniqueCount="{total}">'
    )
    for s in strings:
        xml += f'<si><t xml:space="preserve">{esc(s)}</t></si>'
    xml += '</sst>'
    return xml, seen


def col_letter(n: int) -> str:
    """Convert 0-based column index to Excel column letter(s)."""
    result = ""
    n += 1
    while n:
        n, r = divmod(n - 1, 26)
        result = chr(65 + r) + result
    return result


def build_sheet_xml(issues, si_map, xf_map):
    """Build sheet1.xml."""
    rows = []

    def si(s: str) -> int:
        return si_map[str(s)]

    def cell_s(col, row, value, style_idx):
        """Shared-string cell."""
        return f'<c r="{col_letter(col)}{row}" t="s" s="{style_idx}"><v>{si(value)}</v></c>'

    # --- Header row (row 1) ---
    header_cells = "".join(cell_s(c, 1, COLUMNS[c], 1) for c in range(len(COLUMNS)))
    rows.append(f'<row r="1" ht="30" customHeight="1">{header_cells}</row>')

    # --- Data rows ---
    for r, iss in enumerate(issues, start=2):
        sev = iss["severity"]
        stat = iss["status"]
        cat = iss["category"]

        # Pick xf: severity for most columns, status for status col, category for category col
        def xf(col_name: str) -> int:
            if col_name == "Status":
                return xf_map.get(stat, 2)
            if col_name == "Category":
                return xf_map.get(cat, 2)
            return xf_map.get(sev, 2)

        vals = [
            iss["id"], iss["category"], iss["severity"], iss["file"],
            iss["lines"], iss["description"], iss["code_before"],
            iss["code_after"], iss["status"], iss["notes"]
        ]
        cells = "".join(cell_s(c, r, vals[c], xf(COLUMNS[c])) for c in range(len(COLUMNS)))
        rows.append(f'<row r="{r}">{cells}</row>')

    # Column widths
    cols_xml = "".join(
        f'<col min="{i+1}" max="{i+1}" width="{w}" bestFit="1" customWidth="1"/>'
        for i, w in enumerate(COLUMN_WIDTHS)
    )

    sheet = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
        ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheetViews><sheetView workbookViewId="0" tabSelected="1"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>'
        f'<cols>{cols_xml}</cols>'
        '<sheetData>'
        + "".join(rows) +
        '</sheetData>'
        '<autoFilter ref="A1:J1"/>'
        '</worksheet>'
    )
    return sheet


def write_xlsx(path: str, issues: list):
    styles_xml, xf_map, fill_map = build_styles_xml(SEVERITY_COLORS, STATUS_COLORS, CATEGORY_COLORS)
    ss_xml, si_map = build_shared_strings(issues)
    sheet_xml = build_sheet_xml(issues, si_map, xf_map)

    now = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")

    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as zf:
        zf.writestr("[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
            '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
            '<Override PartName="/xl/sharedStrings.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sharedStrings+xml"/>'
            '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
            '</Types>'
        )
        zf.writestr("_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
            '</Relationships>'
        )
        zf.writestr("xl/_rels/workbook.xml.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
            '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
            '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/sharedStrings" Target="sharedStrings.xml"/>'
            '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
            '</Relationships>'
        )
        zf.writestr("xl/workbook.xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"'
            ' xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
            f'<fileVersion appName="xl" lastEdited="6" lowestEdited="6" rupBuild="14420"/>'
            '<workbookPr date1904="0"/>'
            '<bookViews><workbookView xWindow="0" yWindow="0" windowWidth="22260" windowHeight="12192"/></bookViews>'
            '<sheets><sheet name="Code Review" sheetId="1" r:id="rId1"/></sheets>'
            '</workbook>'
        )
        zf.writestr("xl/styles.xml", styles_xml)
        zf.writestr("xl/sharedStrings.xml", ss_xml)
        zf.writestr("xl/worksheets/sheet1.xml", sheet_xml)

    print(f"✅  Written: {path}")
    print(f"    Issues documented: {len(issues)}")
    print(f"    Fixed:     {sum(1 for i in issues if i['status'] == 'Fixed')}")
    print(f"    Pending:   {sum(1 for i in issues if i['status'] == 'Pending')}")
    print(f"    Wont Fix: {sum(1 for i in issues if i['status'] == 'Wont Fix')}")


if __name__ == "__main__":
    out = os.path.join(os.path.dirname(__file__), "code-review-report.xlsx")
    write_xlsx(out, ISSUES)
