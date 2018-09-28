const LeafletIIIFAnnotation = {

    ZOOM: 2,

    initialize: function (leaflet_map, featureGroup, defaultZoneType, toolTipOptions) {
        this.default_zone_type = defaultZoneType;
        this.annotations = [];
        this.annotationTypes = {};
        this.map = leaflet_map;
        this.featureGroup = featureGroup;
        //const tooltip_max_width = this.map.getSize().x * 0.9;
        //console.log("tooltip max width:", tooltip_max_width);
        this.toolTipOptions = toolTipOptions ? toolTipOptions : {direction: "center", className: "facsimileToolTip"};
    },

    _makeAnnotation: function (layer) {
        let coords = [];
        if (layer instanceof L.Circle) {
            const c = layer.toGeoJSON().geometry.coordinates;
            const center = this.map.project([c[1], c[0]], LeafletIIIFAnnotation.ZOOM);
            coords = [center.x, center.y, layer.getRadius() * 4]
        } else {
            for (let c of layer.toGeoJSON().geometry.coordinates) {
                if (!c) {
                    return null;
                }
                for (let i = 0; i < c.length; i++) {
                    const point = this.map.project([c[i][1], c[i][0]], LeafletIIIFAnnotation.ZOOM);
                    coords.push( point.x + "," + point.y);
                }
            }
        }

        coords = coords.join(',');

        //check if it's a point
        if (new Set(coords.split(",")).size === 1) {
            return null;
        }

        if (!layer.annotation_type) {
            layer.annotation_type = this.annotationTypes[this.default_zone_type.label]; //TODO: sortir cette valeur par défaut
        }

        return  {
            region: {coords: coords},
            content: layer.content,
            annotation_type: layer.annotation_type,
            canvas_id : layer.canvas_id,
            img_id : layer.img_id,
            zone_id: layer.zone_id
        };
    },

    getAnnotations: function (canevas_id, img_id) {
        /*
        *   Get annotations from the leaflet shapes
        * */
        this.annotations = [];
        const _this = this;

        this.featureGroup.eachLayer(function (layer) {
            if (!layer.canvas_id)
                layer.canvas_id = canevas_id;
            if (!layer.img_id)
                layer.img_id = img_id;
            const new_anno = _this._makeAnnotation(layer);
            //console.log("new anno", new_anno);
            if (new_anno){
            _this.annotations.push(new_anno);
            }
        });
        return this.annotations
    },

    setAnnotations: function (annotationLists) {
        this.featureGroup.clearLayers();
        /*
            let's draw the regions
         */
        console.log(this.featureGroup.getLayers().length);
        //console.log(annotationLists);
        //console.log(this.annotationTypes);
        for (let listId in annotationLists) {
            if (annotationLists[listId].annotations.length > 0) {
                this.annotationTypes[annotationLists[listId].annotation_type.label] = annotationLists[listId].annotation_type;
                for (let annotation of annotationLists[listId].annotations) {

                    let c = annotation.region.coords.split(',');
                    let shape = null;
                    switch (annotation.region.type) {
                        case "rect":
                            shape = L.rectangle([this.map.unproject([c[0], c[1]], LeafletIIIFAnnotation.ZOOM), this.map.unproject([c[2], c[3]], 2)]);
                            break;
                        case "polygon":
                            let pointList = [];
                            for (let i = 0; i < c.length; i += 2) {
                                pointList.push(this.map.unproject([c[i], c[i + 1]], LeafletIIIFAnnotation.ZOOM));
                            }
                            shape = L.polygon(pointList);
                            break;
                        case "circle":
                            shape = L.circle(this.map.unproject([c[0], c[1]], LeafletIIIFAnnotation.ZOOM), {radius: c[2] * 0.25});
                            break;
                    }

                    //add the shape & the content to the map
                    shape.canvas_id = annotation.canvas_id;
                    shape.img_id = annotation.img_id;
                    shape.zone_id = annotation.zone_id;
                    shape.content = annotation.content;
                    if (annotation.content && annotation.content.length > 0) {
                        shape.bindTooltip(annotation.content, this.toolTipOptions);
                    }
                    shape.annotation_type = annotationLists[listId].annotation_type;
                    this.featureGroup.addLayer(shape);

                    shape.addTo(this.map);
                }
            }

        }
        console.log(this.featureGroup.getLayers().length);
        //this.hideShapes();
    }
};

export default LeafletIIIFAnnotation;
