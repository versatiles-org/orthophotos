/** Default highest zoom level for tile generation. A region can override it with `maxZoom` in its metadata. */
export const MAX_ZOOM = 17;

/**
 * Zoom-dependent WebP quality setting for tile encoding: 70 up to zoom 15, then 50, 30, 20, 10.
 * The deep zooms are compressed hard because they hold most of the tiles: each level has four
 * times the tiles of the one below. Only regions with a `maxZoom` above 17 reach 18 and 19.
 */
export const QUALITY = '70,16:50,17:30,18:20,19:10';
