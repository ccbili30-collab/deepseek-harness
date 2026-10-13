# Built-in real-world heightmaps

8-bit grayscale elevation rasters (0-255 → pipeline heights via FMG's power
curve). Vendored from Azgaar's Fantasy-Map-Generator `public/heightmaps`
(MIT license); the source rasters were rendered from real DEM data with
tangrams/heightmapper (auto-exposure off, max elevation 2000, min -500).

Reference as `heightmap: {"kind":"png","path":"<name>"}` — e.g. `east-asia`,
`world`, `world-from-pacific`, `eurasia`.
