# Classroom lessons

Each file here is the lesson for one skill. Its name is the skill's id: `py_conditionals.json` teaches
the skill `py_conditionals` from `content/skills.json`. The classroom builds everything it shows from
this file: the code chalked on the board, the textbook's cover and pages, and what the listening
desk reads aloud. To change a subject, edit its file. To add a subject, add a skill to
`skills.json` and a lesson file here. A skill with no lesson file still gets a simple lesson made from
its worked example.

## The parts of a lesson

```json
{
  "skill": "py_conditionals",
  "chapter": 1,
  "title": "Every rule has an edge",
  "look": { "subject": "Python", "color": "#2D4A6E" },
  "chalkboard": { ... },
  "textbook": { "pages": [ ... ] },
  "listen": { "transcript": [ ... ] }
}
```

### `look` (optional)

How the subject looks in the room.

| Field | What it does |
| --- | --- |
| `subject` | The name on the textbook's cover, for example "Python" or "Circuits". |
| `color` | The textbook's cover, the edge of the open book, and the accents on the stations. Any CSS colour. Pick one dark enough for cream text (contrast of 4.5:1 or more). |

Without `look`, the subject's domain decides: Python is navy, Circuits is brick red.

### `chalkboard`

| Field | What it does |
| --- | --- |
| `title` | Written at the top of the board. |
| `code` | The lines on the board, one string per line. Code or plain sentences both work; long lines wrap. |
| `local_label` | The name on the inner memory box, for example `ticket_price(age)`. |
| `steps` | What happens, one step at a time (below). |

Each step:

| Field | What it does |
| --- | --- |
| `line` | Which line of `code` is running (0 is the first line). The highlight glides to it. Use `-1` for no line. |
| `say` | What the teacher says about this step. |
| `memory` | `{ "global": { "name": "value" }, "local": { ... } }`: the names and values after this step. New or changed values glow. |
| `error`, `error_label` | Set `error` to `true` on the step where the bug happens. The highlight turns red and `error_label` is shown in bold. |

If no step has a `line`, the board teaches by notes instead: each step's `say` is chalked up under
the problem as the learner reaches it. If no step has any `memory`, the memory column is left out.

### `textbook`

`pages` is a list of spreads. Each spread has a left page of text and a right page with a diagram.

| Field | What it does |
| --- | --- |
| `kicker` | The small line above the title, for example "Chapter 1 · Conditional logic". |
| `title` | The page title. |
| `paragraphs` | The text of the left page, one string per paragraph. |
| `diagram` | Two nested boxes: `outer` and `inner`, each with a `label` and `lines`. |
| `key_term` | `{ "term": "...", "definition": "..." }`, shown under the diagram. |

### `listen`

`transcript` is a list of short parts, read aloud one after another. Keep each part to a sentence or
two (600 characters at most).

## Spoken audio

The listening desk reads each part with ElevenLabs when the server has a key, and with the browser's
own voice otherwise. Put the key in a `.env` file at the project root (git ignores it):

```
ELEVENLABS_API_KEY=your-key
ELEVENLABS_VOICE_ID=optional-voice-id
```

Each part is generated once and saved under `data/tts/`, so a lesson heard once plays again without
a network connection. Editing a part's text generates it again the next time it is played.
