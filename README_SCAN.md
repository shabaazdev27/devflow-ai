How to scan a repository for quick security issues

This repo includes a small script to scan a local repo (or remote git URL) for common risky patterns.

Usage

- Scan local path:
  python scripts/scan_repo.py --repo /path/to/repo

- Scan remote Git repository (temporary clone):
  python scripts/scan_repo.py --repo https://github.com/org/project.git

Report
- The script writes a JSON report to src/data/scan_reports/<timestamp>_report.json
- It prints a short summary and up to 20 findings to stdout.

What it checks (quick):
- f-strings that interpolate variables into SQL queries
- SELECT and other raw SQL patterns
- cursor.execute / .execute calls
- os.system / subprocess usages
- eval / exec / pickle.load / yaml.load
- occurrences of token/secret/password/private_key
- CVE mentions and UNC paths (SMB/\server\share)

Notes
- This is a lightweight convenience tool for quick, local inspection. It is not a full static analyzer.
- For production scanning, integrate tools like bandit, semgrep, pip-audit, or vendor-managed SCA scanners.
