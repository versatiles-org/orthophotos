EPSG:25832


WMS: https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP?REQUEST=GetCapabilities&version=1.1.1&service=WMS
CSW: https://geomis.geoportal-th.de/geonetwork/srv/ger/csw?REQUEST=GetRecordById&SERVICE=CSW&VERSION=2.0.2&Elementsetname=full&outputSchema=http://www.isotc211.org/2005/gmd&ID=3940ce6d-a2fc-44cf-9b30-916f999750ae



What would be a good approach to download all data from a WMS service (https://www.geoproxy.geoportal-th.de/geoproxy/services/DOP?REQUEST=GetCapabilities&version=1.1.1&service=WMS), in:
- projection EPSG:25832
- with a resolution of 20cm per pixel
- downloading as image tiles with 5000x5000 pixels each
- so each tiles is 1kmx1km