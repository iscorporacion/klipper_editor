"use client";

import Link from "next/link";
import { useState } from "react";
import {
  BsArrowsMove,
  BsFiles,
  BsGithub,
  BsImage,
  BsJournalText,
  BsLightningCharge,
  BsThermometerHalf
} from "react-icons/bs";
import { FaCode, FaDownload, FaLanguage, FaUpload } from "react-icons/fa";
import { IoPower } from "react-icons/io5";
import { MdEmergency, MdHome } from "react-icons/md";

const appBasePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

type HelpImageProps = {
  src: string;
  alt: string;
  label: string;
};

const features = [
  {
    icon: BsFiles,
    title: "Explorador de archivos",
    text: "Navega la carpeta de configuracion de Klipper con estructura jerarquica, iconos por tipo de archivo y pestañas internas del editor."
  },
  {
    icon: FaCode,
    title: "Editor para configuraciones Klipper",
    text: "Abre, edita y guarda archivos de texto con resaltado para `.cfg`, macros G-code, JSON, YAML, scripts y archivos de configuracion."
  },
  {
    icon: BsJournalText,
    title: "Includes y secciones",
    text: "Detecta includes reales, ignora includes comentados, abre archivos relacionados y lista secciones como `[gcode_macro ...]` para saltar rapidamente."
  },
  {
    icon: BsLightningCharge,
    title: "Macros activas",
    text: "Lista macros desde la cadena activa iniciada en `printer.cfg`, permite buscar, abrir el archivo en la linea correcta y ejecutar macros desde Moonraker."
  },
  {
    icon: BsThermometerHalf,
    title: "Calentadores",
    text: "Muestra cama y extrusores, cachea el catalogo para abrir rapido, permite establecer objetivos y enfriar cada calentador desde su etiqueta."
  },
  {
    icon: MdHome,
    title: "Home y comandos rapidos",
    text: "Incluye botones para Home All, Home X, Home Y, Home Z y Z Tilt cuando la configuracion de Klipper lo expone."
  },
  {
    icon: BsArrowsMove,
    title: "Movimiento y Z-Offset",
    text: "Permite mover la maquina despues de hacer home, seleccionar distancia, mover por eje, ingresar posiciones absolutas y validar limites de ejes."
  },
  {
    icon: MdEmergency,
    title: "Parada de emergencia",
    text: "Envia emergency stop a Moonraker desde la barra principal para detener la maquina de inmediato."
  },
  {
    icon: IoPower,
    title: "Reinicio de firmware",
    text: "Permite reiniciar firmware manualmente y bloquea la accion mientras hay una impresion activa."
  },
  {
    icon: FaUpload,
    title: "Subir y crear archivos",
    text: "Permite subir archivos de configuracion y crear archivos en blanco usando dialogos propios de la aplicacion."
  },
  {
    icon: FaDownload,
    title: "Descargar y borrar",
    text: "Cada archivo muestra acciones al pasar el mouse para descargar o borrar con confirmacion local."
  },
  {
    icon: BsImage,
    title: "Visor de imagenes",
    text: "Los archivos de imagen se abren en un visor dentro del editor; los ZIP se tratan como descarga, no como archivo editable."
  },
  {
    icon: FaLanguage,
    title: "Idiomas por JSON",
    text: "La interfaz carga idiomas desde archivos JSON. Ingles es el idioma por defecto y se puede agregar otro idioma creando un nuevo JSON."
  }
];

const screenshots = [
  {
    file: "01-main-editor.png",
    title: "Pantalla principal",
    description: "Captura el editor con el explorador abierto, un `.cfg` cargado, pestañas visibles y el panel de Includes/Secciones."
  },
  {
    file: "02-include-navigation.png",
    title: "Includes navegables",
    description: "Captura un archivo donde se vea un `[include ...]` resaltado o abierto desde el editor."
  },
  {
    file: "03-section-preview.png",
    title: "Vista previa de secciones",
    description: "Captura el panel de Secciones con el popup de vista previa abierto sobre una seccion."
  },
  {
    file: "04-macros-modal.png",
    title: "Modal de macros",
    description: "Captura el buscador de macros con varias macros listadas y el boton de ejecucion visible."
  },
  {
    file: "05-heaters-modal.png",
    title: "Modal Hot",
    description: "Captura la ventana de calentadores con BED/EX visibles, temperatura actual y objetivo editable."
  },
  {
    file: "06-movement-modal.png",
    title: "Modal de movimiento",
    description: "Captura la ventana de movimiento con posiciones X/Y/Z, limites, botones de jog y Z-Offset."
  },
  {
    file: "07-file-actions.png",
    title: "Acciones del explorador",
    description: "Captura el hover sobre un archivo mostrando descargar y borrar."
  },
  {
    file: "08-options-modal.png",
    title: "Opciones",
    description: "Captura la seleccion de idioma y la opcion de crear copia de seguridad al guardar."
  }
];

function HelpImage({ src, alt, label }: HelpImageProps) {
  const [missing, setMissing] = useState(false);

  return (
    <div className="help-screenshot-frame">
      {!missing && <img src={src} alt={alt} onError={() => setMissing(true)} />}
      {missing && (
        <div className="help-image-placeholder">
          <span>{label}</span>
        </div>
      )}
    </div>
  );
}

export default function HelpPage() {
  return (
    <main className="help-page">
      <header className="help-hero">
        <div>
          <p className="help-eyebrow">Klipper Editor</p>
          <h1>Ayuda y caracteristicas</h1>
          <p>
            Klipper Editor es una interfaz web local para editar configuraciones de Klipper/RatOS junto a
            Mainsail y Moonraker. Esta pensada para trabajar en `printer_data/config` desde el navegador de la
            impresora.
          </p>
        </div>
        <div className="help-hero-actions">
          <Link className="help-action" href="/">
            Abrir editor
          </Link>
          <a
            className="help-action secondary"
            href="https://github.com/iscorporacion/klipper_editor"
            target="_blank"
            rel="noreferrer"
          >
            <BsGithub />
            GitHub
          </a>
        </div>
      </header>

      <section className="help-section">
        <h2>Caracteristicas</h2>
        <div className="help-feature-grid">
          {features.map((feature) => {
            const Icon = feature.icon;

            return (
              <article className="help-feature" key={feature.title}>
                <Icon className="help-feature-icon" />
                <h3>{feature.title}</h3>
                <p>{feature.text}</p>
              </article>
            );
          })}
        </div>
      </section>

      <section className="help-section">
        <h2>Capturas</h2>
        <p className="help-section-copy">
          Coloca estas imagenes en `public/help/`. Si una imagen no existe, esta pagina mostrara el nombre esperado.
        </p>
        <div className="help-screenshot-grid">
          {screenshots.map((screenshot) => (
            <figure className="help-screenshot" key={screenshot.file}>
              <HelpImage
                src={`${appBasePath}/help/${screenshot.file}`}
                alt={screenshot.title}
                label={screenshot.file}
              />
              <figcaption>
                <strong>{screenshot.title}</strong>
                <span>{screenshot.description}</span>
                <code>public/help/{screenshot.file}</code>
              </figcaption>
            </figure>
          ))}
        </div>
      </section>

      <section className="help-section help-install">
        <h2>Instalacion precompilada</h2>
        <p>
          La instalacion recomendada descarga una version ya compilada desde GitHub Releases. Esto evita ejecutar
          `next build` en la impresora y reduce el uso de memoria.
        </p>
        <pre>
          <code>{`curl -fsSL https://raw.githubusercontent.com/iscorporacion/klipper_editor/main/install-release.sh | bash`}</code>
        </pre>
        <p>
          La aplicacion completa no es candidata para GitHub Pages porque necesita ejecutar APIs del servidor,
          acceder al filesystem local de la impresora y comunicarse con Moonraker. GitHub Pages solo serviria para
          documentacion estatica.
        </p>
      </section>
    </main>
  );
}
