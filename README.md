# DSG Communications Hub Prototype

This repository contains the first static prototype for the DSG Communications Hub.

The hub is designed to become a team-facing execution interface for communications, briefs, workflows, resource links, prompts, and next-step task cards.

## Current prototype

The current version is static and reads local JSON files from the `data/` folder.

It includes:

- Search bar
- Filters for category, tool, status, and owner
- Sort by due date, priority, or title
- Task cards with owner, support, approver, due date, deliverable, save location, links, and prompt
- Copy prompt buttons
- Compact resource cards
- A working sample dataset based on the DSG Team Next Steps structure

## GitHub Pages setup

The first deployment workflow failed because this repository is not yet configured for GitHub Pages deployment through Actions.

For the prototype, use the simpler Pages setup:

1. Open the repository on GitHub.
2. Go to **Settings > Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**.
4. Select branch: `main`.
5. Select folder: `/ (root)`.
6. Save.

After GitHub finishes publishing, the prototype should be available at:

```text
https://admindsg.github.io/hmtl/
```

The failing Actions workflow was removed so it should not keep sending failed-run emails.

## Intended future workflow

The DSG Leadership Cockpit remains the source of truth.

Future flow:

1. Refresh the DSG Leadership Cockpit.
2. Export selected rows from maintained tabs into JSON.
3. Commit the JSON files to this repo.
4. The GitHub Pages site updates from the branch source.

Suggested source tabs:

- Team Next Steps
- Brief System
- Action Tracker
- Delegation Queue
- Lookups / Resource Links

## Data files

- `data/tasks.json` stores task cards.
- `data/resources.json` stores shared links and tools.

## Local preview

Open `index.html` in a browser.

For best results with JSON loading, serve the folder locally:

```bash
python3 -m http.server 8080
```

Then open:

```text
http://localhost:8080
```

## Next build step

Connect cockpit export fields to the task schema in `data/tasks.json`.

Minimum required task fields:

- title
- category
- project
- status
- priority
- owner
- support
- approves
- due
- tool
- deliverable
- saveFinalIn
- context
- nextSteps
- links
- prompt
