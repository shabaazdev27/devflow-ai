#!/usr/bin/env python3
"""
Simple repository scanner.

Usage:
  python scripts/scan_repo.py --repo /path/to/repo
  python scripts/scan_repo.py --repo https://github.com/org/repo.git

Produces a JSON report in src/data/scan_reports/<timestamp>_report.json and
prints a short summary to stdout.
"""
import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime

TEXT_EXTS = {'.py', '.js', '.ts', '.tsx', '.jsx', '.md', '.txt', '.json', '.yml', '.yaml', '.Dockerfile'}
SKIP_DIRS = {'.git', 'node_modules', '.next', '__pycache__', 'dist', 'build', 'venv', '.venv', 'backend/.secrets'}

PATTERNS = {
    'raw_sql_fstring': re.compile(r"f["'].*SELECT.*\{[^}]+\}.*["']", re.IGNORECASE),
    'select_star_or_raw': re.compile(r"SELECT\s+\*|SELECT\s+.+FROM\s+", re.IGNORECASE),
    'cursor_execute': re.compile(r"cursor\.execute\(|execute\(|\.execute\(", re.IGNORECASE),
    'os_system_subprocess': re.compile(r"\bos\.system\(|subprocess\.|Popen\(|call\(|check_output\(", re.IGNORECASE),
    'eval_exec_pickle': re.compile(r"\beval\(|\bexec\(|pickle\.load\(|yaml\.load\(|marshal\.loads\(|compile\(", re.IGNORECASE),
    'secrets_tokens': re.compile(r"\b(token|secret|password|private_key|ACCESS_TOKEN|SECRET_KEY|gitlab_access_token|gemini_api_key)\b", re.IGNORECASE),
    'cve_mentions': re.compile(r"CVE-\d{4}-\d{4,}", re.IGNORECASE),
    'smb_unc': re.compile(r"\\\\[A-Za-z0-9_.-]+\\[A-Za-z0-9_.-]+"),
}


def is_text_file(path: str) -> bool:
    _, ext = os.path.splitext(path)
    if ext in TEXT_EXTS:
        return True
    # Dockerfile etc.
    name = os.path.basename(path)
    if name.lower().startswith('dockerfile'):
        return True
    return False


def clone_repo(url: str, dest: str) -> bool:
    try:
        subprocess.check_call(['git', 'clone', '--depth', '1', url, dest])
        return True
    except Exception as e:
        print(f"Failed to clone {url}: {e}")
        return False


def scan_path(root: str):
    findings = []
    total_files = 0
    for dirpath, dirnames, filenames in os.walk(root):
        # prune skip dirs
        dirnames[:] = [d for d in dirnames if d not in SKIP_DIRS]
        for fn in filenames:
            path = os.path.join(dirpath, fn)
            if not is_text_file(path):
                continue
            total_files += 1
            try:
                with open(path, 'r', encoding='utf-8', errors='replace') as f:
                    for i, line in enumerate(f, start=1):
                        for key, regex in PATTERNS.items():
                            if regex.search(line):
                                findings.append({
                                    'file': os.path.relpath(path, root),
                                    'line': i,
                                    'match_type': key,
                                    'snippet': line.strip()[:400]
                                })
                                # limit duplicates per line
                                break
            except Exception:
                continue
    return {'root': root, 'total_files_scanned': total_files, 'findings': findings}


def ensure_out_dir():
    out_dir = os.path.join('src', 'data', 'scan_reports')
    os.makedirs(out_dir, exist_ok=True)
    return out_dir


def main():
    p = argparse.ArgumentParser()
    p.add_argument('--repo', required=True, help='Path to local repo or git URL')
    p.add_argument('--keep-clone', action='store_true', help='Do not remove temporary clone')
    args = p.parse_args()

    repo = args.repo
    need_cleanup = False
    target = repo
    if repo.startswith('http://') or repo.startswith('https://') or repo.endswith('.git'):
        tmp = tempfile.mkdtemp(prefix='repo-scan-')
        ok = clone_repo(repo, tmp)
        if not ok:
            sys.exit(2)
        target = tmp
        need_cleanup = not args.keep_clone

    print(f"Scanning: {target}")
    report = scan_path(target)
    report['scanned_at'] = datetime.utcnow().isoformat() + 'Z'

    out_dir = ensure_out_dir()
    fname = datetime.utcnow().strftime('%Y%m%dT%H%M%SZ') + '_report.json'
    path = os.path.join(out_dir, fname)
    with open(path, 'w', encoding='utf-8') as f:
        json.dump(report, f, indent=2)

    print(f"Scanned {report['total_files_scanned']} files — findings: {len(report['findings'])}")
    for i, fnd in enumerate(report['findings'][:20], start=1):
        print(f"{i}. {fnd['file']}:{fnd['line']} [{fnd['match_type']}] {fnd['snippet']}")

    print(f"Full JSON report written to: {path}")

    if need_cleanup:
        try:
            shutil.rmtree(target)
        except Exception:
            pass


if __name__ == '__main__':
    main()
