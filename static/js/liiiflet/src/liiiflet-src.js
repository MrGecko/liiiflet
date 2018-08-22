import L from 'leaflet';

import '../lib/Leaflet.Editable';
import '../lib/Path.Drag';
import '../lib/Leaflet.Control.Custom';
import tileLayerIiif from './leaflet-iiif';
import LeafletIIIFAnnotation from './leaflet-iiif-annotation';
import IIIFAnnotationLoader from './iiif-annotation-loader';

import "../scss/main.scss";

class LiiifletSrc {

    constructor(map_id, callbacks, tooltipOptions, enable_edition = false) {

        this.callbacks = callbacks;

        this.map_id = map_id;
        this.auth_header = null;

        this.must_be_saved = false;
        this.enable_edition = enable_edition;

        if (!this.callbacks.loadManifest) {
            console.log("Liiiflet callbacks are improperly configured");
            return;
        }

        this.callbacks.loadManifest().then((response) => {
            const manifest_data = response.data.data;

            this.canvases_data = manifest_data.sequences[0].canvases;
            this.mapCreate();

            this.editableLayers = new L.FeatureGroup();
            this.map.addLayer(this.editableLayers);
            LeafletIIIFAnnotation.initialize(this.map, this.editableLayers, tooltipOptions);

            this.map.on('editable:enable', LeafletIIIFAnnotation.showShapes);
            // only save when changes to the geometry occured
            const _this = this;
            this.map.on('editable:disable', function () {
                //LeafletIIIFAnnotation.resetMouseOverStyle();
                /*
                if (_this.must_be_saved) {
                    _this.saveAll().then(function () {
                        console.log("annotations saved.");
                        _this._must_be_saved = false;
                    });
                }
                */
            });
            this.map.on('editable:editing', function () {
                _this.must_be_saved = true;
            });
            this.map.on('editable:created', function (e) {
                _this.editableLayers.addLayer(e.layer);
                e.layer.on('click', L.DomEvent.stop).on('click', function () {
                    _this.onShapeClick(e.layer);
                });
            });
            // Finally load the annotations
            this.annotationsLoader = IIIFAnnotationLoader.initialize(this.canvases_data, this.callbacks.loadAnnotations);
            // and display them
            this.toggleDisplayAnnotations();

            if (this.enable_edition) {
                this.addDrawControls();
            }

        });

    }


    handleAPIErrors(response) {
        const error_str = JSON.stringify(response.errors);
        if (response.errors) {
            this.error = error_str;
            throw new Error(error_str);
        }
    }

    mapCreate() {
        this.map = L.map(this.map_id, {
            center: [0, 0],
            crs: L.CRS.Simple,
            zoom: 0,
            //attributionControl: false,
            zoomControl: false,
            editable: true
        });

        const manifest_info = this.canvases_data[0].images[0].resource.service['@id'] + '/info.json';
        this.baseLayer = tileLayerIiif(manifest_info);
        this.baseLayer.addTo(this.map);

        // build a map of canvas ids and img ids
        this.canvases = [];
        this.images = [];
        for (let c of this.canvases_data) {
            this.canvases.push(c["@id"]);
            this.images.push(c.images[0].resource['@id']);
        }
        console.log(this.canvases);
        console.log(this.images);

        if (this.canvases.length > 1) {
            this.addPaginationControls();
        }
    }

    addPaginationControls() {

        let thumbnails = '';
        for (let img_id of this.images) {
            const thumbnail_url = img_id.replace("full/full", "full/,80");
            thumbnails += '<div class="iiif-thumbnail"><img src="' + thumbnail_url + '"/></div>';
        }

        L.control.custom({
            id: 'facsimile-pagination-control',
            position: 'bottomleft',
            content: '<div class="facsimile-pagination">' +
                thumbnails +
                '</div>',
            classes: '',
            style:
                {
                    padding: '0px 0 0 0',
                    cursor: 'pointer',
                },
            datas:
                {
                    'foo': 'bar',
                },
            events:
                {
                    click: function (data) {
                        console.log('wrapper div element clicked');
                        console.log(data);
                    },
                    dblclick: function (data) {
                        console.log('wrapper div element dblclicked');
                        console.log(data);
                    },
                    contextmenu: function (data) {
                        console.log('wrapper div element contextmenu');
                        console.log(data);
                    },
                }
        }).addTo(this.map);
    }

    createDrawControls() {

        const drawingToolsContainer = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
        const workflowToolsContainer = L.DomUtil.create('div', 'leaflet-control leaflet-bar');
        const _this = this;
        L.DomEvent.disableClickPropagation(drawingToolsContainer);
        L.DomEvent.disableClickPropagation(workflowToolsContainer);

        L.EditControl = L.Control.extend({

            options: {
                position: 'topright',
                callback: null,
                kind: '',
                title: '',
                html: '',
                classes: '',
            },

            onAdd: function (map) {
                let link = L.DomUtil.create('a', '', drawingToolsContainer);

                link.href = '#';
                link.title = this.options.title;
                link.innerHTML = this.options.html;
                for (let c of this.options.classes) {
                    L.DomUtil.addClass(link, c);
                }
                L.DomEvent.on(link, 'click', L.DomEvent.stop)
                    .on(link, 'click', function () {
                        if (!_this.erasing) {
                            window.LAYER = this.options.callback.call(map.editTools);
                        }
                    }, this);

                return drawingToolsContainer;
            }

        });

        const showShapes = func => function(latlng, options) {
            LeafletIIIFAnnotation.showShapes();
            func.bind(this.map.editTools)(latlng, options);
        };

        L.NewPolygonControl = L.EditControl.extend({
            options: {
                callback: showShapes(this.map.editTools.startPolygon),
                title: 'Ajouter un polygone',
                classes: ['leaflet-iiifmap-toolbar', 'leaflet-iiifmap-toolbar-polygon']
            }
        });
        L.NewRectangleControl = L.EditControl.extend({
            options: {
                callback: showShapes(this.map.editTools.startRectangle),
                title: 'Ajouter un rectangle',
                classes: ['leaflet-iiifmap-toolbar', 'leaflet-iiifmap-toolbar-rectangle']
            }
        });
        L.NewCircleControl = L.EditControl.extend({
            options: {
                callback: showShapes(this.map.editTools.startCircle),
                title: 'Ajouter un cercle',
                classes: ['leaflet-iiifmap-toolbar', 'leaflet-iiifmap-toolbar-circle']
            }
        });

        /*
            Build the Save All button
        */

        L.SaveAllControl = L.Control.extend({
            onAdd: function (map) {
                let link = L.DomUtil.create('a', '', workflowToolsContainer),
                    svg = L.DomUtil.create('a', '', link);

                link.href = '#';
                link.title = 'Sauvegarder';

                L.DomUtil.addClass(svg, 'fas fa-save fa-lg workflow-tool');
                L.DomEvent.on(link, 'click', L.DomEvent.stop)
                    .on(link, 'click', function () {
                        // save annotations (if any change occured) then hide zones
                        _this.disableErasingMode();
                        if (_this.must_be_saved) {
                            _this.saveAll().then(function () {
                                _this.editableLayers.eachLayer(function (l) {
                                    l.disableEdit();
                                    _this.must_be_saved = false;
                                }, this);
                            });
                        } else {
                            _this.editableLayers.eachLayer((l) => {
                                l.disableEdit();
                            });
                        }
                        LeafletIIIFAnnotation.resetMouseOverStyle();
                    }, this);

                return workflowToolsContainer;
            }
        });

        L.ErasingModeControl = L.Control.extend({
            onAdd: function (map) {
                let link = L.DomUtil.create('a', '', workflowToolsContainer),
                    svg = L.DomUtil.create('a', '', link);

                link.href = '#';
                link.title = 'Supprimer une zone';
                L.DomUtil.addClass(link, 'erasing-disabled');
                L.DomUtil.addClass(svg, 'fas fa-eraser fa-lg workflow-tool');

                _this.disableErasingMode = function () {
                    _this.erasing = false;
                    L.DomUtil.addClass(link, 'erasing-disabled');
                    L.DomUtil.removeClass(link, 'erasing-enabled');
                    LeafletIIIFAnnotation.resetMouseOverStyle();
                };
                _this.enableErasingMode = function () {
                    _this.erasing = true;
                    _this.editableLayers.eachLayer((l) => {
                        l.disableEdit();
                    });
                    LeafletIIIFAnnotation.showShapes();
                    L.DomUtil.removeClass(link, 'erasing-disabled');
                    L.DomUtil.addClass(link, 'erasing-enabled');
                };
                _this.toggleErasingMode = function () {
                    _this.erasing = !_this.erasing;
                    if (_this.erasing) {
                        _this.enableErasingMode();
                    }
                    else {
                        _this.disableErasingMode();
                    }
                };

                L.DomEvent.on(link, 'click', L.DomEvent.stop)
                    .on(link, 'click', _this.toggleErasingMode, this);

                return workflowToolsContainer;
            }
        });

        L.ReloadControl = L.Control.extend({
            onAdd: function (map) {
                let link = L.DomUtil.create('a', '', workflowToolsContainer),
                    svg = L.DomUtil.create('a', '', link);

                link.href = '#';
                link.title = 'Annuler les changements apportés';

                L.DomUtil.addClass(svg, 'fas fa-undo fa-lg workflow-tool');
                L.DomEvent
                    .on(link, 'click', L.DomEvent.stop)
                    .on(link, 'dbclick', L.DomEvent.stop)
                    .on(link, 'click', function () {
                        console.log("reload annotations");
                        _this.disableErasingMode();
                        _this.clearAnnotations();
                        _this.annotationsLoader = IIIFAnnotationLoader.initialize(_this.canvases_data, _this.callbacks.loadAnnotations);
                        LeafletIIIFAnnotation.initialize(_this.map, _this.editableLayers);
                        _this.setAnnotations();

                    }, this);

                return workflowToolsContainer;
            }
        });

        this.mapControls = [
            new L.NewPolygonControl(),
            new L.NewRectangleControl(),
            //new L.NewCircleControl(),
            new L.ErasingModeControl(),
            new L.SaveAllControl(),
            new L.ReloadControl()
        ];
    }

    addDrawControls() {
        this.createDrawControls();
        for (let c of this.mapControls) {
            this.map.addControl(c);
        }
    }

    removeDrawControls() {
        for (let c of this.mapControls) {
            this.map.removeControl(c);
        }
        this.mapControls = [];
    }

    saveZones(annotations) {
        if (!this.enable_edition) {
            return;
        }
        if (!this.callbacks.saveAnnotations){
            console.log("Liiiflet 'saveAnnotations' callback improperly configured");
            return;
        }

        const new_annotations = [];
        for (let anno of annotations) {
            //console.log(anno);
            //console.log(this.images);
            //console.log(this.canvases);
            const newAnnotation = {
                img_idx: this.images.indexOf(anno.img_id),
                canvas_idx: this.canvases.indexOf(anno.canvas_id),
                coords: anno.region.coords,
                content: anno.annotation_type.label === "annotation" ? anno.content : "",
                zone_type_id: anno.annotation_type.id
            };
            new_annotations.push(newAnnotation);
        }
        return this.callbacks.saveAnnotations(new_annotations);
    }

    saveAlignments(annotations) {
        if (!this.enable_edition) {
            return;
        }
        if (!this.callbacks.saveAnnotationAlignments){
            console.log("Liiiflet 'saveAnnotationAlignments' callback improperly configured");
            return;
        }

        return this.callbacks.saveAnnotationAlignments(annotations);
    }
    /*
        let doc_id = 1;
        let user_id = 1;
        // TODO
            return axios.delete(`/adele/api/1.0/documents/${doc_id}/transcriptions/alignments/images/from-user/${user_id}`,
                this.auth_header)
                .then((response) => {
                    this.handleAPIErrors(response);
                    let data = {
                        username: "AdminJulien",
                        img_idx: 0,
                        canvas_idx: 0,
                        alignments: [
                            {
                                "zone_id": 15,
                                "ptr_start": 1,
                                "ptr_end": 89
                            },
                            {
                                "zone_id": 26,
                                "ptr_start": 90,
                                "ptr_end": 220
                            }
                        ]
                    };
                    for (let anno of annotations) {
                        // TODO : get alignments ptrs
                    }
                    return axios.post(`/adele/api/1.0/documents/${doc_id}/transcriptions/alignments/images`, {"data": data},
                        this.auth_header
                    );
                });
    */

    getCurrentCanevasId() {
        return this.canvases[0]; // TODO
    }

    getCurrentImageId() {
        return this.images[0]; // TODO
    }

    saveAll() {
        /*
          - Read annotations from LeafletIIIFAnnotation
          - call the API to post the new data (zones then alignments)
         */
        const annotations = LeafletIIIFAnnotation.getAnnotations(this.getCurrentCanevasId(), this.getCurrentImageId());

        return this.saveZones(annotations)
            .then((response) => {
                console.log(response);
                this.handleAPIErrors(response);
                return this.saveAlignments( annotations)
            })
            .then((response) => {
                console.log(response);
                this.handleAPIErrors(response);
                return true
            });
    }

    setAnnotations() {
        console.log("set annotations");
        const _this = this;
        this.annotationsLoader.then(function () {
            LeafletIIIFAnnotation.setAnnotations(IIIFAnnotationLoader.annotationLists);
            /*
            *  Bind actions on shape clicks
            * */
            _this.editableLayers.eachLayer(function (layer) {
                layer.on('click', L.DomEvent.stop).on('click', function () {
                    _this.onShapeClick(layer)
                });
            });
            _this.must_be_saved = false;
        });
    }

    clearAnnotations() {
        console.log("clear annotations");
        this.editableLayers.clearLayers();
    }

    toggleDisplayAnnotations() {
        if (this.displayAnnotationsMode) {
            this.setAnnotations();
        } else {
            this.clearAnnotations();
        }
    }

    onShapeClick(shape) {
        if (this.drawMode) {
            if (this.erasing) {
                this.editableLayers.removeLayer(shape);
                this.must_be_saved = true;
            } else {
                shape.toggleEdit();
            }
        }
    }

    displayAnnotationsMode() {
        if (this.displayAnnotationsMode) {
            this.setAnnotations();
        } else {
            this.clearAnnotations();
        }
    }


}

window.Liiiflet = LiiifletSrc;
