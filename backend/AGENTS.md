# Component ownership

Read `../docs/genie_context.md`, `../docs/integration_contract.md`, `../docs/backend.md`, and `../docs/backend_setup.md` before changes.

Work within `backend/` and its owned setup document. Keep dependency and lockfile changes inside this component. Coordinate API changes with the other owner. Never commit secrets. The backend uses Python and FastAPI, with `main.py` as its entry point and `requirements.txt` for dependencies. Verify imports and relevant behavior before handoff. Do not add Node tooling to this folder.
