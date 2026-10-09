"""Motor de anonimización de historias clínicas (español, Colombia).

Todo el procesamiento es local. Presidio valida los correos con `tldextract`,
que por defecto descarga de internet la lista pública de sufijos de dominio la
primera vez que se usa (y la cachea en el home del usuario). En la app de
escritorio no debe haber tráfico de red: se reemplaza su extractor global por
uno que solo usa la copia de la lista que trae el propio paquete.
"""
from tldextract import TLDExtract
from tldextract import tldextract as _tldextract

_tldextract.TLD_EXTRACTOR = TLDExtract(suffix_list_urls=(), cache_dir=None)
