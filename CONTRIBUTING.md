# Contributing

Thanks for taking a look at TraceLens. The project aims to stay small, auditable and local-first.

## Before proposing a change

1. Open an issue for larger features so the problem and tradeoffs are clear.
2. Keep log contents in the browser. Do not add upload, telemetry, analytics or persistence without an explicit privacy design discussion.
3. Keep the sample data synthetic. Never add production logs, credentials, customer data or real identifiers.
4. Prefer native browser APIs and avoid dependencies unless they solve a concrete problem.

## Change guidelines

- Preserve the raw event when adding normalized fields.
- Document accepted field names and timestamp assumptions in `docs/data-format.md`.
- Escape imported values before inserting them into the DOM.
- Keep the 20 MB import limit and progressive row display in mind when changing rendering paths.
- Describe manual reproduction steps and any format assumptions in your pull request.

## Local preview

```bash
python3 -m http.server 8000
```

Open `http://localhost:8000` in a browser and use the bundled incident sample before trying another file.
