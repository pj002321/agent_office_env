Copies of three@0.170 addons (`node_modules/three/examples/jsm/...`), mapped as `three/addons/` in index.html.
electron-builder drops every dependency's top-level `examples/` folder, so the packaged app can't load them from node_modules.
Re-copy these when upgrading three.
