PY := .venv/bin/python

.DEFAULT_GOAL := help
.PHONY: help instalar ui dev app pruebas fugas build dmg

help:  ## Muestra esta ayuda
	@grep -E '^[a-z-]+:.*##' $(MAKEFILE_LIST) | sed 's/:.*## /\t/' | column -t -s "$$(printf '\t')"

instalar:  ## Crea el entorno (.venv + node_modules)
	uv venv --python 3.12 .venv
	uv pip install --python $(PY) -r requirements-dev.txt
	cd ui && npm ci

ui:  ## Compila la interfaz (ui/dist)
	cd ui && npm run build

dev:  ## Interfaz en el navegador con API simulada (http://localhost:5317)
	cd ui && npm run dev

app: ui  ## Abre la app de escritorio con la interfaz compilada
	$(PY) -m escritorio.app

pruebas:  ## Pruebas del motor (pytest) y de la interfaz (vitest + typecheck)
	$(PY) -m pytest -q
	cd ui && npm run typecheck && npm test

fugas:  ## Fugas de PII de punta a punta en todos los datasets  [DATOS=]
	@for d in $(if $(DATOS),$(DATOS),datos datos_sintetico_co datos_sintetico_ame datos_meddocan); do \
		echo "== $$d"; $(PY) -m tests.evaluacion.fugas --quieto --datos tests/evaluacion/$$d; done
	@echo "== datos_sintetico_ame (desde los PDF)"
	@$(PY) -m tests.evaluacion.fugas --quieto --datos tests/evaluacion/datos_sintetico_ame --pdfs tests/evaluacion/pdfs_sintetico_ame

build: ui  ## Empaqueta la app para el sistema actual (dist/)
	$(PY) -m PyInstaller --noconfirm empaquetado/sima_anonimizador.spec
	"dist/SIMA Anonimizador.app/Contents/MacOS/SIMA Anonimizador" --autoprueba tests/evaluacion/pdfs_sintetico_ame /tmp/sima-autoprueba \
		&& echo "Autoprueba OK" || (echo "Autoprueba FALLÓ"; exit 1)

dmg: build  ## Crea el instalador .dmg de macOS
	rm -rf dmg && mkdir dmg && cp -R "dist/SIMA Anonimizador.app" dmg/ && ln -s /Applications dmg/Aplicaciones
	hdiutil create -volname "SIMA Anonimizador" -srcfolder dmg -ov -format UDZO dist/SIMA-Anonimizador-macOS.dmg
	rm -rf dmg
