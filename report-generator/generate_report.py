import json
import argparse
import os
from datetime import datetime
from pathlib import Path
from jinja2 import Environment, FileSystemLoader


SEVERITY_ORDER = {
    "Safe": 0,
    "Low": 1,
    "Medium": 2,
    "High": 3,
    "Critical": 4,
}


def generate_report(json_path: str, template_path: str, output_path: str):
    """
    JSON 결과 파일과 Jinja2 템플릿을 병합하여 마크다운 보고서를 생성합니다.
    """
    # 1. 결과 JSON 로드
    if not os.path.exists(json_path):
        raise FileNotFoundError(f"JSON result file not found: {json_path}")
        
    with open(json_path, 'r', encoding='utf-8') as f:
        report_data = json.load(f)
    report_data = normalize_report_data(report_data, json_path)

    # 2. Jinja2 템플릿 환경 설정
    template_dir = os.path.dirname(template_path)
    template_name = os.path.basename(template_path)
    
    env = Environment(loader=FileSystemLoader(template_dir))
    template = env.get_template(template_name)

    # 3. 템플릿 렌더링
    final_markdown = template.render(
        report_info=report_data.get('report_info', {}),
        results=report_data.get('results', {})
    )

    # 4. 출력 파일 저장
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(final_markdown)
        
    print(f"✅ 보고서가 성공적으로 생성되었습니다: {os.path.abspath(output_path)}")


def normalize_report_data(report_data: dict, json_path: str) -> dict:
    """
    기존 AIM 보고서 JSON과 Mohican normalized-result.json을 모두 보고서 템플릿 입력으로 맞춥니다.
    백엔드 결과에 없는 값은 비워두지 않고 출력 가능한 기본값으로 채웁니다.
    """
    if "engineResults" in report_data:
        return normalize_mohican_result(report_data, json_path)

    report_info = report_data.get("report_info", {})
    results = report_data.get("results", {})
    normalized_results = {
        module_id: normalize_module(module_id, data)
        for module_id, data in results.items()
        if isinstance(data, dict)
    }
    return {
        "report_info": {
            "target_model": report_info.get("target_model", "-"),
            "scan_date": report_info.get("scan_date", scan_date_from_file(json_path)),
            "total_modules_run": report_info.get("total_modules_run", len(normalized_results)),
            "overall_severity": report_info.get(
                "overall_severity",
                overall_severity(normalized_results),
            ),
        },
        "results": normalized_results,
    }


def normalize_mohican_result(report_data: dict, json_path: str) -> dict:
    request_data = load_sibling_request(json_path)
    target_model = (
        request_data.get("target", {}).get("model")
        or report_data.get("target_model")
        or "-"
    )
    modules = {}
    for engine_result in report_data.get("engineResults", []):
        if not isinstance(engine_result, dict):
            continue
        engine = engine_result.get("engine", "unknown")
        module_id = f"{engine}_evaluation"
        summary = engine_result.get("summary", {}) or {}
        failed = int(summary.get("failed") or 0)
        total = int(summary.get("total") or 0)
        modules[module_id] = {
            "display_name": f"{tool_label(engine)} - Security Evaluation",
            "tool": tool_label(engine),
            "severity": severity_from_summary(summary),
            "total_tested": total,
            "vulnerable_count": failed,
            "details": details_from_findings(engine_result.get("findings", [])),
        }

    return {
        "report_info": {
            "target_model": target_model,
            "scan_date": scan_date_from_file(json_path),
            "total_modules_run": len(modules),
            "overall_severity": severity_from_summary(report_data.get("summary", {}) or {}),
        },
        "results": modules,
    }


def normalize_module(module_id: str, data: dict) -> dict:
    return {
        "display_name": data.get("display_name") or module_id,
        "tool": data.get("tool") or "-",
        "severity": data.get("severity") or "Safe",
        "total_tested": int(data.get("total_tested") or 0),
        "vulnerable_count": int(data.get("vulnerable_count") or 0),
        "details": data.get("details") if isinstance(data.get("details"), list) else [],
    }


def load_sibling_request(json_path: str) -> dict:
    path = Path(json_path).resolve()
    candidates = [
        path.parent / "request.json",
        path.parent.parent / "request.json",
        path.parent.parent.parent / "request.json",
    ]
    for candidate in candidates:
        if candidate.exists():
            with open(candidate, "r", encoding="utf-8") as f:
                return json.load(f)
    return {}


def scan_date_from_file(json_path: str) -> str:
    try:
        timestamp = os.path.getmtime(json_path)
    except OSError:
        timestamp = datetime.now().timestamp()
    return datetime.fromtimestamp(timestamp).strftime("%Y-%m-%d %H:%M:%S")


def severity_from_summary(summary: dict) -> str:
    failed = int(summary.get("failed") or 0)
    errors = int(summary.get("errors") or 0)
    risk_score = float(summary.get("riskScore") or summary.get("risk_score") or 0)
    if failed > 0 or risk_score >= 0.67:
        return "High"
    if errors > 0 or risk_score >= 0.34:
        return "Medium"
    if risk_score > 0:
        return "Low"
    return "Safe"


def overall_severity(results: dict) -> str:
    severity = "Safe"
    for module in results.values():
        candidate = module.get("severity", "Safe")
        if SEVERITY_ORDER.get(candidate, 0) > SEVERITY_ORDER.get(severity, 0):
            severity = candidate
    return severity


def tool_label(engine: str) -> str:
    labels = {
        "promptfoo": "Promptfoo",
        "garak": "Garak",
        "custom-suite": "Custom",
    }
    return labels.get(engine, engine)


def details_from_findings(findings: list) -> list:
    details = []
    for finding in findings:
        if not isinstance(finding, dict) or finding.get("passed") is True:
            continue
        details.append(
            {
                "prompt": finding.get("payload") or finding.get("plugin") or finding.get("probe") or "-",
                "response": finding.get("response") or finding.get("evidence") or finding.get("detector") or "-",
                "status": "VULNERABLE",
            }
        )
    return details

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate LLM Security Report from JSON")
    parser.add_argument("--input", "-i", default="sample_results.json", help="Path to the JSON results file")
    parser.add_argument("--template", "-t", default="report_template.md.j2", help="Path to the Jinja2 template file")
    parser.add_argument("--output", "-o", default="final_report.md", help="Path to the output Markdown file")
    
    args = parser.parse_args()
    
    generate_report(args.input, args.template, args.output)
