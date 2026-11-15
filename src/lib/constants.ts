/** Default highest zoom level for tile generation. A region can override it with `maxZoom` in its metadata. */
export const MAX_ZOOM = 17;

/**
 * Whether tiles are encoded with the settlement-proximity map (#86). Off until the map is built on
 * the build machine and the seams between quality zones have been checked.
 */
export const QUALITY_MAP_ENABLED: boolean = false;

/**
 * Zoom-dependent WebP quality setting for tile encoding: 70 up to zoom 15, then 50 at 16 (30–50
 * with the map), 30 at 17 (10–30 with the map), 20 at 18 and 10 at 19.
 * The deep zooms are compressed hard because they hold most of the tiles: each level has four
 * times the tiles of the one below. Only regions with a `maxZoom` above 17 reach 18 and 19.
 *
 * With `QUALITY_MAP_ENABLED`, a range takes its upper end in settlements and its lower end far
 * from them, chosen by the settlement-proximity map (`quality-map.ts`, `docs/quality-zones.md`).
 * Far from settlements, opaque tiles of a Mayotte test came out 29–31% smaller at 16 and 43–45%
 * smaller at 17. Without it, every tile gets the upper end, the quality used before the map.
 */
export const QUALITY: string = QUALITY_MAP_ENABLED ? '70,16:30-50,17:10-30,18:20,19:10' : '70,16:50,17:30,18:20,19:10';
