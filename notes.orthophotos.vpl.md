from_stacked_raster auto_overscale=true [
  from_container filename="/home/data/orthophotos/lt/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/li/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/al/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/ch/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/nl/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/cz/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/ro/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/lv/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/hamburg/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/rheinland_pfalz/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/nordrhein_westfalen/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/saarland/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/brandenburg/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/thueringen/tiles.versatiles" | raster_mask geojson="thueringen.geojson" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/bremen/tiles_bhv.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/bremen/tiles_hb.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/mecklenburg_vorpommern/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/schleswig_holstein/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/hessen/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/bayern/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/niedersachsen/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/sachsen_anhalt/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/baden_wuerttemberg/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/de/sachsen/tiles.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/fr/tiles_RGAF09UTM20.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/fr/tiles_LAMB93.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/fr/tiles_RGFG95UTM22.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/fr/tiles_RGR92UTM40S.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/fr/tiles_RGM04UTM38S.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/fr/tiles_RGSPM06U21.versatiles" | filter level_min=11,
  from_container filename="/home/data/orthophotos/fr/tiles_UTM01SW84.versatiles" | filter level_min=11,
  from_container filename="/home/data/satellite/s2gm/s2gm_overview.versatiles",
  from_container filename="/home/data/satellite/bluemarble/bluemarble.versatiles" | raster_levels gamma=0.8 brightness=0.2 contrast=0.8
] | meta_update
  name="VersaTiles - Satellite + Orthophotos"
  description="High-resolution satellite and orthophoto imagery from various providers, merged by VersaTiles."
  schema="rgb"
  attribution="<a href='https://versatiles.org/sources/'>VersaTiles sources</a>"