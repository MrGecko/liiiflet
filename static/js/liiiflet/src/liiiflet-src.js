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
        this.erasing = false;
        this.showing = false;

        this.tooltipOptions = tooltipOptions;

        this.editableLayers = new L.FeatureGroup();

        if (!this.callbacks.loadManifest || !this.callbacks.loadDefaultAnnotationType) {
            console.log("Liiiflet callbacks are improperly configured");
            return;
        }

        // load the data
        this.callbacks.loadDefaultAnnotationType().then((response) => {
            this.default_zone_type = response;
            // async load of the manifest & map creation
            this.callbacks.loadManifest().then((response) => {
                if(response && response.sequences && response.sequences.length >= 1) {
                    this.canvases_data = response.sequences[0].canvases;
                    this.displayMap(0);

                    if (this.enable_edition){
                        LiiifletSrc.disableShowingMode();
                    } else {
                        this.showing = false;
                        this.hideShapes();
                    }
                } else {
                    console.log("Error1 loading manifest:");
                    console.log("Response: ", response);
                }

            }).catch((response) => {
                console.log("Error2 loading manifest:");
                console.log("Response: ", response);
            });
        }).catch((response) => {
            console.log("Error3 loading manifest:");
            console.log("Response: ", response);
        });

    }

    handleAPIErrors(response) {
        if (response && response.errors) {
            const error_str = JSON.stringify(response.errors);
            if (response.errors) {
                this.error = error_str;
                throw new Error(error_str);
            }
        }
    }

    mapCreate(canvas_idx, img_idx) {
        this.map = L.map(this.map_id, {
            center: [0, 0],
            crs: L.CRS.Simple,
            zoom: 0,
            //attributionControl: false,
            zoomControl: false,
            editable: this.enable_edition
        });
        this.map.doubleClickZoom.disable();

        const manifest_info = this.canvases_data[canvas_idx].images[img_idx].resource.service['@id'] + '/info.json';
        this.baseLayer = tileLayerIiif(manifest_info);
        this.baseLayer.addTo(this.map);

        this.clearAnnotations(); // clear editableLayers
        this.map.addLayer(this.editableLayers);

        // build a map of canvas ids and img ids
        this.canvases = [];
        this.images = [];
        for (let c of this.canvases_data) {
            this.canvases.push(c["@id"]);
            this.images.push(c.images[0].resource['@id']);
        }
        //console.log(this.canvases);
        //console.log(this.images);

        const _this = this;
        this.map.on('editable:editing', function () {
                _this.must_be_saved = true;
        });
        this.map.on('editable:created', function (e) {
            _this.editableLayers.addLayer(e.layer);
            _this.must_be_saved = true;
            e.layer.on('click', L.DomEvent.stop).on('click', function () {
                _this.onShapeClick(e.layer);
            });
        });

        this.map.on('editable:drawing:commit', function (e) {
            LiiifletSrc.unselectDrawingTools();
        });

        if (this.canvases.length > 1) {
            this.addPaginationControls();
        }
        if (this.enable_edition) {
            this.addDrawControls();
        }
    }

    displayMap(canvas_idx) {

        this.current_canvas_idx = canvas_idx;
        this.current_img_idx = 0;

        if (!this.map) {
            this.mapCreate(this.current_canvas_idx, this.current_img_idx);
        } else {
            const manifest_info = this.canvases_data[canvas_idx].images[this.current_img_idx].resource.service['@id'] + '/info.json';
            this.map.removeLayer(this.baseLayer);
            this.baseLayer = tileLayerIiif(manifest_info);
            this.baseLayer.addTo(this.map);
            this.editableLayers.clearLayers();
            //this.editableLayers = new L.FeatureGroup();
            this.map.addLayer(this.editableLayers);
        }

        this.clearAnnotations();

        this.annotationsLoader = IIIFAnnotationLoader.initialize(this.canvases_data[this.current_canvas_idx], this.callbacks.loadAnnotations);
        LeafletIIIFAnnotation.initialize(this.map, this.editableLayers, this.default_zone_type, this.tooltipOptions);

        return this.setDisplayMode();
    }

    addPaginationControls() {

        let thumbnails = '';
        let num_page = 1;
        for (let img_id of this.images) {
            const thumbnail_url = img_id.replace("full/full", "full/,80");
            thumbnails += '<div class="iiif-thumbnail '+ (this.current_canvas_idx+1 === num_page ? 'selected-page' : '') +'">';
            thumbnails += '<img src="' + thumbnail_url + '"/><div>'+ num_page +'</div>';
            thumbnails += '<input type="hidden" value="' + (num_page - 1) + '"/></div>';
            num_page += 1;
        }

        const _this = this;
        function goToPage(data) {
            if (data.target.tagName === "IMG") {
                const thumbnail = data.target.parentNode;
                const num_page = parseInt(thumbnail.getElementsByTagName('input')[0].value);
                // display the clicked page
                _this.displayMap(num_page);
                // select the clicked thumbnail
                for (let t of document.getElementsByClassName("iiif-thumbnail")){
                    t.classList.remove('selected-page');
                }
                thumbnail.classList.add('selected-page');

                if (_this.enable_edition) {
                    LiiifletSrc.disableErasingMode();
                    LiiifletSrc.unselectDrawingTools();
                }
            }
        }

        L.control.custom({
            id: 'facsimile-pagination-control',
            position: 'bottomleft',
            content: '<div class="facsimile-pagination">' +  thumbnails + '</div>',
            classes: '',
            style:
                {
                    padding: '0px 0 0 0',
                    cursor: 'pointer',
                },
            /*
            datas:
                {
                    'foo': 'bar',
                },
            */
            events:
                {
                    click: data => goToPage(data),
                    /*
                    dblclick: function (data) {
                        console.log('wrapper div element dblclicked');
                        console.log(data);
                    },
                    contextmenu: function (data) {
                        console.log('wrapper div element contextmenu');
                        console.log(data);
                    },
                    */
                }
        }).addTo(this.map);
    }

    createDrawControls() {
        console.log("create draw controls");
        const drawingToolsContainer = L.DomUtil.create('div', 'leaflet-control leaflet-bar drawing-tools-bar');
        const workflowToolsContainer = L.DomUtil.create('div', 'leaflet-control leaflet-bar workflow-tools-bar');
        const _this = this;
        L.DomEvent.disableClickPropagation(drawingToolsContainer);
        L.DomEvent.disableClickPropagation(workflowToolsContainer);

        const _startDrawingFeatures = func => function(latlng, options) {
            if (_this.map.editTools.drawing()){
                this.map.editTools.stopDrawing();
            } else {
                LiiifletSrc.enableShowingMode();
                LiiifletSrc.disableErasingMode();
                func.bind(this.map.editTools)(latlng, options);
            }
        };

        L.EditControl = L.Control.extend({
            options: {
                position: 'topright',
                callback: null,
                kind: '',
                title: '',
                classes: '',
            },
            onAdd: function (map) {
                let link = L.DomUtil.create('a', '', drawingToolsContainer),
                    svg = L.DomUtil.create('a', '', link);

                link.href = '#';
                link.title = this.options.title;

                L.DomUtil.addClass(svg, 'fas fa-save fa-lg');
                for (let c of this.options.classes) {
                    L.DomUtil.addClass(svg, c);
                }

                L.DomEvent.on(link, 'click', L.DomEvent.stop)
                    .on(link, 'click', function () {
                        _this.erasing = false;
                        window.LAYER = this.options.callback.call(map.editTools);
                        // switch icons
                        const _is_tool_enabled = L.DomUtil.hasClass(link, 'tool-enabled');
                        LiiifletSrc.unselectDrawingTools();
                        if (_is_tool_enabled) {
                            L.DomUtil.removeClass(link, 'tool-enabled');
                            L.DomUtil.addClass(link, 'tool-disabled');
                        } else {
                            L.DomUtil.removeClass(link, 'tool-disabled');
                            L.DomUtil.addClass(link, 'tool-enabled');
                        }

                    }, this);
                return drawingToolsContainer;
            }
        });

        L.NewPolygonControl = L.EditControl.extend({
            options: {
                callback: _startDrawingFeatures(this.map.editTools.startPolygon),
                title: 'Ajouter un polygone',
                classes: ['leaflet-iiifmap-toolbar', 'leaflet-iiifmap-toolbar-polygon', 'fas', 'fa-draw-polygon']
            }
        });
        L.NewRectangleControl = L.EditControl.extend({
            options: {
                callback: _startDrawingFeatures(this.map.editTools.startRectangle),
                title: 'Ajouter un rectangle',
                classes: ['leaflet-iiifmap-toolbar', 'leaflet-iiifmap-toolbar-rectangle', 'fas', 'fa-square-full']
            }
        });
        L.NewCircleControl = L.EditControl.extend({
            options: {
                callback: _startDrawingFeatures(this.map.editTools.startCircle),
                title: 'Ajouter un cercle',
                classes: ['leaflet-iiifmap-toolbar', 'leaflet-iiifmap-toolbar-circle', 'fas', 'fa-circle']
            }
        });

        L.ShowingModeControl = L.Control.extend({
            onAdd: function (map) {
                let link = L.DomUtil.create('a', '', workflowToolsContainer),
                    svg = L.DomUtil.create('a', '', link);

                link.href = '#';
                link.title = 'Afficher les zones';
                LiiifletSrc.enableShowingMode = function() {
                    _this.showing = true;
                    LiiifletSrc.showShapes();
                    L.DomUtil.addClass(link, 'tool-enabled');
                    L.DomUtil.removeClass(link, 'tool-disabled');
                };

                LiiifletSrc.disableShowingMode = function() {
                    LiiifletSrc.disableErasingMode();
                    _this.showing = false;
                    _this.hideShapes();
                    L.DomUtil.addClass(link, 'tool-disabled');
                    L.DomUtil.removeClass(link, 'tool-enabled');
                };

                _this.toggleShowingMode = function () {
                    _this.showing = !_this.showing;
                    LiiifletSrc.unselectDrawingTools();
                    if (_this.showing) {
                        LiiifletSrc.enableShowingMode();
                    }
                    else {
                        LiiifletSrc.disableShowingMode();
                    }
                };

                L.DomUtil.addClass(svg, 'fas fa-eye fa-lg workflow-tool');
                L.DomEvent.on(link, 'click', L.DomEvent.stop)
                    .on(link, 'click', _this.toggleShowingMode, this);

                return workflowToolsContainer;
            }
        });

        L.ErasingModeControl = L.Control.extend({
            onAdd: function (map) {
                let link = L.DomUtil.create('a', '', workflowToolsContainer),
                    svg = L.DomUtil.create('a', '', link);

                link.href = '#';
                link.title = 'Supprimer une zone';
                L.DomUtil.addClass(link, 'tool-disabled');
                L.DomUtil.addClass(svg, 'fas fa-eraser fa-lg workflow-tool');

                LiiifletSrc.disableErasingMode = function () {
                    _this.erasing = false;
                    L.DomUtil.addClass(link, 'tool-disabled');
                    L.DomUtil.removeClass(link, 'tool-enabled');
                };
                LiiifletSrc.enableErasingMode = function () {
                    _this.erasing = true;
                    _this.editableLayers.eachLayer((l) => {
                        l.disableEdit();
                    });
                    LiiifletSrc.enableShowingMode();
                    L.DomUtil.removeClass(link, 'tool-disabled');
                    L.DomUtil.addClass(link, 'tool-enabled');
                };
                _this.toggleErasingMode = function () {
                    LiiifletSrc.unselectDrawingTools();
                    _this.erasing = !_this.erasing;
                    if (_this.erasing) {
                        LiiifletSrc.enableErasingMode();
                    }
                    else {
                        LiiifletSrc.disableErasingMode();
                    }
                };

                L.DomEvent.on(link, 'click', L.DomEvent.stop)
                    .on(link, 'click', _this.toggleErasingMode, this);

                return workflowToolsContainer;
            }
        });

        L.SaveAllControl = L.Control.extend({
            onAdd: function (map) {
                let link = L.DomUtil.create('a', '', workflowToolsContainer),
                    svg = L.DomUtil.create('a', '', link);

                link.href = '#';
                link.title = 'Sauvegarder';

                L.DomUtil.addClass(svg, 'fas fa-save fa-lg workflow-tool');
                L.DomEvent.on(link, 'click', L.DomEvent.stop)
                    .on(link, 'click', function () {
                        // save annotations (if any change occured)
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
                    }, this);

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
                        const _was_showing = _this.showing;
                        LiiifletSrc.unselectDrawingTools();
                        LiiifletSrc.disableErasingMode();
                        _this.clearAnnotations();
                        _this.annotationsLoader = IIIFAnnotationLoader.initialize(
                            _this.canvases_data[_this.current_canvas_idx],
                            _this.callbacks.loadAnnotations
                        );
                        LeafletIIIFAnnotation.initialize(_this.map, _this.editableLayers, _this.default_zone_type, _this.tooltipOptions);
                        _this.setAnnotations().then(function(){
                            if (_was_showing) {
                                LiiifletSrc.enableShowingMode();
                            }
                        });
                    }, this);

                return workflowToolsContainer;
            }
        });

        this.mapControls = [
            new L.ShowingModeControl(),
            new L.NewPolygonControl(),
            new L.NewRectangleControl(),
            new L.NewCircleControl(),
            new L.ErasingModeControl(),
            new L.SaveAllControl(),
            new L.ReloadControl(),
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

    static unselectDrawingTools() {
            for (let d of document.getElementsByClassName('drawing-tools-bar')) {
                for (let e of d.getElementsByTagName('a')){
                    e.classList.remove('tool-enabled');
                    e.classList.add('tool-disabled');
                }
            }
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

            console.log(anno);
            /*
            console.log(this.images);
            console.log(this.canvases);
            */
            const newAnnotation = {
                img_idx: this.current_img_idx,//this.images.indexOf(anno.img_id),
                canvas_idx: this.current_canvas_idx,//this.canvases.indexOf(anno.canvas_id),
                coords: anno.region.coords,
                content: anno.content ? anno.content : "",
                zone_type_id:  anno.annotation_type ? anno.annotation_type.id : this.default_zone_type.id
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
        return this.canvases[this.current_canvas_idx];
    }

    getCurrentImageId() {
        return this.images[this.current_img_idx];
    }

    saveAll() {
        /*
          - Read annotations from LeafletIIIFAnnotation
          - call the API to post the new data (zones then alignments)
         */
        const annotations = LeafletIIIFAnnotation.getAnnotations(this.getCurrentCanevasId(), this.getCurrentImageId());
        console.log("save: ", this.getCurrentCanevasId(), this.getCurrentImageId());

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
        return this.annotationsLoader.then(function () {
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

            if (!_this.showing) {
                if (_this.enable_edition) {
                    LiiifletSrc.disableShowingMode();
                } else {
                    _this.showing = false;
                    _this.hideShapes();
                }
            }
        });
    }

    clearAnnotations() {
        console.log("clear annotations");
        const _this = this;
        return new Promise(function(resolve, reject) {
           _this.editableLayers.clearLayers();
           resolve();
        });
    }

    setDisplayMode() {
        if (this.displayAnnotationsMode) {
            return this.setAnnotations();
        } else {
            return this.clearAnnotations();
        }
    }

    onShapeClick(shape) {
        if (this.enable_edition) {
            if (this.erasing) {
                this.editableLayers.removeLayer(shape);
                this.must_be_saved = true;
            } else {
                if (this.showing) {
                    shape.toggleEdit();
                }
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

    hideShapes () {
        for (let e of document.getElementsByClassName("leaflet-interactive")) {
            e.style.opacity = 0;
            e.style.cursor = "pointer";
            e.onmouseover = function () {
                this.style.opacity = 0;
            };
            e.onmouseout = function () {
                this.style.opacity = 0;
            };
        }

        this.editableLayers.eachLayer(function (l) {
            l.disableEdit();
        });
    }

    static showShapes() {
        for (let e of document.getElementsByClassName("leaflet-interactive")) {
            e.style.opacity = 100;
            e.style.cursor = "pointer";
            e.onmouseover = null;
            e.onmouseout = null;
        }
    }

}

window.Liiiflet = LiiifletSrc;
