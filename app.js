require([
  './map.js', './layer.js', './search.js', './popup.js', './point-to-extent.js',
  'esri/tasks/query', 'esri/geometry/geometryEngine', 'esri/layers/FeatureLayer',
  'dojo/text!./list-item.html',
  'dojo/string', 'dojo/on',
  'dijit/focus', 'dijit/a11y'
], function(
  map, restaurants, search, popup, pointToExtent,
  Query, geometryEngine, FeatureLayer,
  listTemplate,
  string, on,
  focus, a11y
) {

  /**
   * Focus the search widget when someone clicks or uses the 'spacebar' or 'enter' keys
   * the "Skip to search" skip link.
   */
  document.getElementById('skip-search').addEventListener('keypress', function (e) {
    if (e.keyCode == 13 || e.keyCode == 32  || e.charCode == 32) {
      search.focus();
    }
  });

  document.getElementById('skip-search').addEventListener('click', function (e) {
    search.focus();
  });

  /**
   * Focus the first focusable item in the list
   * when someone clicks or uses the 'spacebar' or 'enter' keys to the "Skip to list" link
   */
  document.getElementById('skip-list').addEventListener('keypress', function (e) {
    if (e.keyCode == 13 || e.keyCode == 32  || e.charCode == 32) {
      focusFirstItemInList();
    }
  });

  document.getElementById('skip-list').addEventListener('click', function (e) {
    focusFirstItemInList();
  });

  /**
   * Utility function to reformat the list based
   * on a new array of features and update the
   * ARIA live region will speak the passed string
   */
  function updateList (features, liveRegionText) {
    var newList = '';

    for (var i = 0; i < features.length; i++) {
      var attributes = features[i].attributes || features[i].feature.attributes;
      newList += string.substitute(listTemplate, attributes);
    }

    document.getElementById('results').innerText = liveRegionText;
    document.getElementById('list').innerHTML = newList;
  }

  /**
   * Utility function to focus the first focusable
   * item in the list. You can use Dojo's very helpful
   * a11y and focus methods for this.
   */
  function focusFirstItemInList () {
    var firstFocusableItem = a11y.getFirstInTabbingOrder('list');
    focus.focus(firstFocusableItem);
  }

  /**
   * Utility function to focus on a specific restraunt
   */
  function focusOnRestraunt (id) {
    var restrauntSection = a11y.getFirstInTabbingOrder('restraunt-' + selectedFeature)
    focus.focus(restrauntSection);
  }

  /**
   * When the feature layer is ready set the extent
   * of the map to include all the restaurants.
   */
  restaurants.on('load', function () {
    map.setExtent(restaurants.fullExtent);
  });

  /**
   * When the layer is done loading features, update
   * the list to match the current array of features.
   */
  restaurants.on('update-end', function () {
    updateList(restaurants.graphics, restaurants.graphics.length + ' restaurants loaded.');
  });

  /**
   * Since our search widget is not setup to
   * automatically navigate or select results
   * we can handle it ourselves by listening to
   * the search-results event.
   */
  search.on('search-results', function () {
    // get the results accordingto the source
    // [0] is the feature layer of restaurants
    // [1] is the world geocoder
    var restrauntResults = search.searchResults && search.searchResults[0];
    var geocoderResults = search.searchResults && search.searchResults[1];

    // if there are restaurants matching the search
    if(restrauntResults && restrauntResults.length) {
      // use the restraunt name if there is only 1 feature
      // otherwise use the value of the text in the search
      var textValue = (restrauntResults.length > 1) ? search.value : restrauntResults[0].name;

      // update the restraunt list and live region
      updateList(restrauntResults, restrauntResults.length + ' restaurants matching ' + textValue + '.');

      // focus the first item in the list
      focusFirstItemInList();

      return;
    }

    // if there is a single result from the geocoder we
    // matched a place name so we can calulate nearby
    // restaurants with geometryEngine and update the list
    if(geocoderResults && geocoderResults.length === 1) {
      var textValue = geocoderResults[0].name;
      var extent = geocoderResults[0].extent;
      var restaurantsInExtent = restaurants.graphics.filter(function (graphic) {
        return geometryEngine.contains(extent, graphic.geometry);
      });

      updateList(restaurantsInExtent, restaurantsInExtent.length + ' restaurants near ' + textValue + '.');
      map.setExtent(extent);
      focusFirstItemInList();

      return;
    }

    // neither of the 2 conditions were met so there are no
    // restraunt results AND more then 1 result from the
    // geocoder so update the live region and focus the input
    updateList([], 'No results matching ' + search.value);
    search.focus();
  });

  /**
   * When the search is cleared update the
   * list and refocus the search input
   */
  search.on('clear-search', function () {
    updateList(restaurants.graphics, 'Search cleared. Showing ' + restaurants.graphics.length + ' restaurants.');
    search.focus();
  });

  /**
   * When the escape key is pressed clear our
   * current search and refocus our input.
   */
  on(document, 'keyup', function (e) {
    if(e.keyCode === 27) {
      search.clear();
      search.focus();
      e.preventDefault();
      e.stopPropagation();
    }
  });

  /**
   * When an item on the list is clicked find the
   * feature that was clicked and open its popup.
   */
  on(document.getElementById('list'), 'button:click', function (e) {
    var id = parseInt(this.dataset.id, 10);
    var feature = restaurants.graphics.filter(function(graphic) {
      return graphic && graphic.attributes && graphic.attributes.FID === id;
    })[0];
    map.infoWindow.setFeatures([feature]);
    map.infoWindow.show(feature.geometry);
    map.centerAndZoom(feature.geometry, 16);
  });

  var selectedFeature;

  /**
   * When we show a popup change the selected feature
   * or update the set of features, select the new item
   * in the list.
   */
  popup.on('show, selection-change, set-features', function (e) {
    var feature = popup.getSelectedFeature();
    selectedFeature = feature ? feature.attributes.FID : undefined;
    if (selectedFeature) {
      focusOnRestraunt(selectedFeature);
    }
  });

  /**
   * When a popup closes return focus to the
   * corresponding list item so users don't get
   * trapped inside the map.
   */
  popup.on('hide', function (e) {
    if(selectedFeature) {
      focusOnRestraunt(selectedFeature);
    }

    selectedFeature = undefined;
  });

  /**
   * When we click the map, query the layer to
   * get the first feature and show its popup.
   */
  map.on('click', function (event) {
    var query = new Query();
    query.geometry = pointToExtent(map, event.mapPoint, 4);

    var selection = restaurants.selectFeatures(query, FeatureLayer.SELECTION_NEW);

    if(selection.features && selection.features.length > 0) {
      map.infoWindow.setFeatures([selection]);
      map.infoWindow.show(event.mapPoint);
    }
  });

  /**
   * Kick everything off by adding our layer to the map
   */
  map.addLayer(restaurants);
});
