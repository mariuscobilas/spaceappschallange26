# Space Apps Challenge 2026

Field Shift starter: Next.js web app, FastAPI backend, and Turborepo task runner. The ML goal and pipeline will be designed separately.

## Project areas

- `apps/web` — Next.js frontend
- `apps/api` — FastAPI endpoints and API documentation
- `apps/api/app/ml` — Python ML work area; see its README before adding model code

## Requirements

Node.js 20.9+, pnpm 9+, and Python 3.11+.

## Setup

Run `pnpm install` at the repository root, then create the API environment:

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

Run `pnpm dev` from the root. The web app is at http://localhost:3000 and the API at http://localhost:8000. See [apps/api/API.md](apps/api/API.md) for endpoints and mock payloads. Run `pnpm run build` to build the frontend. FastAPI is interpreted and has no build step.
