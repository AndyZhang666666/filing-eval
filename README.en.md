# Filing Eval

[中文](README.md) · [Project index](https://github.com/AndyZhang666666/AndyZhang666666/blob/main/PROJECTS.en.md) · [Live demo](https://andyzhang666666.github.io/demos/filing-eval/)

Can a factually correct summary still omit information that changes a decision?

![Actual Filing Eval interface](https://andyzhang666666.github.io/assets/work/showcase/filing-crop.jpg)

## Product decisions

- Review false claims and missing facts separately.
- Keep source, summary and saved judge output together, with human review stored separately.
- Retain disputed labels instead of editing them to improve the reported result.

## Walkthrough

1. Select a notice and inspect a specific claim in its summary.
2. Check the source, then review essential facts absent from the summary.
3. Save the verdict and reasoning, continue pending items, and export the record.

## Run mode and limits

The public demo is a static replay of 28 constructed notices, not an evaluator for arbitrary new text. The original Next.js app and model-evaluation scripts remain in the repository.

Saved model outputs and calibration results belong to their original samples and prompts. This documentation update does not rerun model evaluations or establish production accuracy. Labels and disagreements remain inspectable.

## Run the public replay locally

No dependency installation or model key is needed:

```sh
node scripts/build-demo.mjs
node scripts/verify-demo.mjs
python3 -m http.server 8870 --bind 127.0.0.1 --directory demo
```

Open `http://127.0.0.1:8870/`. The original Next.js app and optional model scripts have separate configuration in the Chinese implementation notes.

## Lightweight checks

```sh
node scripts/build-demo.mjs
node scripts/verify-demo.mjs
node --test scripts/test-review.mjs
```

These commands are provided for reproduction; this documentation update did not run a new model benchmark.

## Documentation

- [Product scope](docs/PRD.md)
- [Design decisions](docs/DECISIONS.md)
- [Review protocol](docs/REVIEW_PROTOCOL.md)
- [Validation records](docs/VALIDATION.md)
- [Implementation details and original records, Chinese](README.md)

Use the repository’s existing licence and notices. This update does not change usage rights.
