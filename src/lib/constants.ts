/** Default highest zoom level for tile generation. A region can override it with `maxZoom` in its metadata. */
export const MAX_ZOOM = 17;

/**
 * Zoom-dependent WebP quality setting for tile encoding: 70 up to zoom 15, then 30–50 at 16,
 * 10–30 at 17, 20 at 18 and 10 at 19.
 * The deep zooms are compressed hard because they hold most of the tiles: each level has four
 * times the tiles of the one below. Only regions with a `maxZoom` above 17 reach 18 and 19.
 *
 * A range takes its upper end in settlements and its lower end far from them, chosen by the
 * settlement-proximity map (`quality-map.ts`, `docs/quality-zones.md`). Far from settlements,
 * opaque tiles of a Mayotte test came out 29–31% smaller at 16 and 43–45% smaller at 17.
 */
export const QUALITY = '70,16:30-50,17:10-30,18:20,19:10';
