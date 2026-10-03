# Third-party UI sources

ElevenLabs UI conversation and message components were fetched from https://github.com/elevenlabs/ui at commit `23c31bd3088814215a8b5d0bfb56b327cad1a578` and adapted into `apps/web/src/components/ai`.

Copyright (c) 2025 Eleven Labs Inc. The complete MIT license is preserved in [licenses/elevenlabs-ui-MIT.txt](licenses/elevenlabs-ui-MIT.txt).

Local adaptations use existing Coss Button/Avatar primitives, respect reduced motion when scrolling, and label the scroll control. No ElevenLabs voice-agent SDK, microphone access, account, or API key is needed for these text components. The upstream voice blocks were inspected; the text interface uses the underlying conversation/message primitives rather than enabling voice calls.

Coss UI primitives were installed using its official `@coss/style` registry preset, https://coss.com/ui/docs/get-started. Dependency licenses remain with their packages.
