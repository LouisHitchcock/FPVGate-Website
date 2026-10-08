# 3D Print Files

STL files for self-built FPVGate timers. Everything in this folder is served as-is by
GitHub Pages and listed on `print-files.html` and in the "3D Printed Parts" section of
`docs.html`. Both read `parts.json`, so publishing a part is just adding the file and an
entry.

## Adding a part

1. Put the STL in a subfolder named after the build it belongs to, e.g.
   `print-files/xiao-s3/case-bottom.stl`. Use lowercase, hyphenated file names (no
   spaces) so the download URLs stay clean.
2. Add an entry to `parts.json`:

```json
{
    "parts": [
        {
            "id": "xiao-case-bottom",
            "name": "Case bottom",
            "build": "Seeed XIAO ESP32S3",
            "file": "xiao-s3/case-bottom.stl",
            "description": "Holds the XIAO and RX5808. Print flat side down.",
            "quantity": 1,
            "print": {
                "material": "PETG",
                "layerHeight": "0.2 mm",
                "infill": "20%",
                "supports": "None"
            }
        }
    ]
}
```

| Field         | Required | Notes                                                                 |
|---------------|----------|-----------------------------------------------------------------------|
| `id`          | yes      | Unique, URL-safe. Used for deep links: `print-files.html#<id>`.       |
| `name`        | yes      | Shown in the list and viewer.                                         |
| `build`       | yes      | Parts are grouped under this heading. Keep the spelling consistent.   |
| `file`        | yes      | Path relative to this folder.                                         |
| `description` | no       | One or two sentences: what it is, orientation, anything unusual.      |
| `quantity`    | no       | How many to print. Defaults to 1.                                     |
| `print`       | no       | Any of `material`, `layerHeight`, `infill`, `supports`, `notes`.      |

3. Serve locally (`python -m http.server 8000`) and check the part on
   `http://localhost:8000/print-files.html`. The viewer assumes the STL is in
   millimetres with Z up, which is the default for most CAD exports; the dimensions shown
   under the viewer are a quick way to spot a model exported in the wrong units.
