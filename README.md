# Space Apps Challenge 2026

Field Shift starter: Next.js web app, FastAPI backend, and Turborepo task runner. The ML goal and pipeline will be designed separately.

## Requirements

Node.js 20.9+, npm, and Python 3.11+. On Windows PowerShell, use `npm.cmd` if `npm.ps1` is blocked.

## Setup

Run `npm install` at the repository root, then create the API environment:

```powershell
# Windows PowerShell
py -m venv apps/api/.venv
apps/api/.venv/Scripts/python.exe -m pip install -r apps/api/requirements.txt
```

```sh
# macOS / Linux
python3 -m venv apps/api/.venv
apps/api/.venv/bin/python -m pip install -r apps/api/requirements.txt
```

Run `npm run dev` from the root. The web app is at http://localhost:3000 and the API at http://localhost:8000. See [apps/api/API.md](apps/api/API.md) for endpoints and mock payloads. Run `npm run build` to build the frontend. FastAPI is interpreted and has no build step.
