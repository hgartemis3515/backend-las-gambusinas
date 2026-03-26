/**
 * GSAP para scripts del dashboard (navegador). Importar desde un bundle o página con soporte ESM.
 * No incluye @gsap/react (el backend no usa React en Node).
 */
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { Flip } from 'gsap/Flip';
import { Observer } from 'gsap/Observer';
import { MotionPathPlugin } from 'gsap/MotionPathPlugin';
import { ScrollToPlugin } from 'gsap/ScrollToPlugin';
import { TextPlugin } from 'gsap/TextPlugin';
import { CustomEase } from 'gsap/CustomEase';
import { RoughEase, SlowMo, ExpoScaleEase } from 'gsap/EasePack';

gsap.registerPlugin(
  ScrollTrigger,
  Flip,
  Observer,
  MotionPathPlugin,
  ScrollToPlugin,
  TextPlugin,
  CustomEase,
  RoughEase,
  SlowMo,
  ExpoScaleEase
);

export { gsap };
