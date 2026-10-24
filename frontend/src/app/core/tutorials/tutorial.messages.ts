import { TranslationBundle } from '../i18n/i18n.types';
import { TUTORIALS } from './tutorials';

export const TUTORIAL_MESSAGES: TranslationBundle = { es: {}, en: {} };
const es: Record<string, string> = {
  'tutorial.packages.orientation': 'Para qué sirve esta pantalla',
  'tutorial.packages.related': 'Otras tareas con paquetes de clases',
  'tutorial.packages.catalog.heading': 'Prepara las opciones de clases que vas a ofrecer',
  'tutorial.packages.catalog.purpose': 'Define cuántas clases incluye cada opción, su duración, precio y condiciones. Preparar un paquete aquí no se lo envía a nadie: después eliges una opción desde Mensajes y envías una oferta al alumno.',
  'tutorial.packages.catalog.link': 'Preparar opciones para ofrecer',
  'tutorial.packages.purchases.heading': 'Consulta las clases que ya compró cada alumno',
  'tutorial.packages.purchases.purpose': 'Comprueba cuántas clases le quedan a cada alumno, cuáles están reservadas y hasta cuándo puede usarlas. Desde cada compra puedes ir a la agenda o conversar sobre la renovación. Para cambiar las opciones que ofreces, ve al catálogo.',
  'tutorial.packages.purchases.link': 'Ver compras y saldo de alumnos',
  'tutorial.packages.groups.heading': 'Reúne a los alumnos que van a tomar clases juntos',
  'tutorial.packages.groups.purpose': 'Elige un paquete grupal, propone un horario e identifica a los participantes. Aquí sigues quién confirmó y qué falta para completar el grupo. Crear el grupo todavía no confirma una clase en la agenda.',
  'tutorial.packages.groups.link': 'Formar un grupo de alumnos',
  'tutorial.nav.purchases': 'Compras, saldo y vencimientos',
  'tutorial.nav.catalog': 'Opciones de clases para ofrecer',
  'tutorial.nav.groups': 'Participantes y confirmaciones',
  'tutorial.help': 'Ayuda de esta pantalla',
  'tutorial.start': 'Iniciar guía',
  'tutorial.repeat': 'Repetir guía',
  'tutorial.invitation': '¿Primera vez aquí? Descubre para qué sirve esta pantalla y practica sus controles.',
  'tutorial.dismiss': 'Ocultar sugerencia',
  'tutorial.next': 'Siguiente', 'tutorial.previous': 'Anterior', 'tutorial.done': 'Terminar',
  'tutorial.skip': 'Omitir práctica', 'tutorial.close': 'Cerrar guía',
  'tutorial.progress': 'Paso {current} de {total}',
  'tutorial.finishTitle': 'Ya conoces el próximo paso',
  'tutorial.finish': 'Puedes cerrar la guía y continuar a tu ritmo. Vuelve a Ayuda de esta pantalla cuando quieras repetirla.',
  'tutorial.unavailable': 'No se pudo cargar la guía. Puedes intentarlo de nuevo desde Ayuda de esta pantalla.',
};
const en: Record<string, string> = {
  'tutorial.packages.orientation': 'What this screen is for',
  'tutorial.packages.related': 'Other class package tasks',
  'tutorial.packages.catalog.heading': 'Prepare the class options you want to offer',
  'tutorial.packages.catalog.purpose': 'Set the number of classes, duration, price and conditions for each option. Preparing a package here does not send it to anyone: later, choose an option in Messages and send an offer to the student.',
  'tutorial.packages.catalog.link': 'Prepare options to offer',
  'tutorial.packages.purchases.heading': 'Review the classes each student has already bought',
  'tutorial.packages.purchases.purpose': 'Check how many classes each student has left, which are reserved and when they expire. From each purchase you can open the schedule or discuss renewal. To change the options you offer, go to the catalog.',
  'tutorial.packages.purchases.link': 'View student purchases and credits',
  'tutorial.packages.groups.heading': 'Bring together students who will take classes as a group',
  'tutorial.packages.groups.purpose': 'Choose a group package, propose a time and identify participants. Here you track who has confirmed and what is missing to complete the group. Creating a group does not yet confirm a class in the schedule.',
  'tutorial.packages.groups.link': 'Form a group of students',
  'tutorial.nav.purchases': 'Purchases, credits and expiry',
  'tutorial.nav.catalog': 'Class options to offer',
  'tutorial.nav.groups': 'Participants and confirmations',
  'tutorial.help': 'Help with this screen',
  'tutorial.start': 'Start guide', 'tutorial.repeat': 'Repeat guide',
  'tutorial.invitation': 'First time here? Discover what this screen is for and try its controls.',
  'tutorial.dismiss': 'Hide suggestion',
  'tutorial.next': 'Next', 'tutorial.previous': 'Previous', 'tutorial.done': 'Finish',
  'tutorial.skip': 'Skip practice', 'tutorial.close': 'Close guide',
  'tutorial.progress': 'Step {current} of {total}',
  'tutorial.finishTitle': 'You know the next step',
  'tutorial.finish': 'Close the guide and continue at your own pace. Return to Help with this screen whenever you want to repeat it.',
  'tutorial.unavailable': 'The guide could not load. You can try again from Help with this screen.',
};
for (const tour of TUTORIALS) {
  es[`tutorial.${tour.id}.title`] = tour.title[0];
  en[`tutorial.${tour.id}.title`] = tour.title[1];
  es[`tutorial.${tour.id}.purpose`] = tour.purpose[0];
  en[`tutorial.${tour.id}.purpose`] = tour.purpose[1];
  for (const step of tour.steps) {
    es[`tutorial.${tour.id}.${step.id}.title`] = step.title[0];
    en[`tutorial.${tour.id}.${step.id}.title`] = step.title[1];
    es[`tutorial.${tour.id}.${step.id}.description`] = step.description[0];
    en[`tutorial.${tour.id}.${step.id}.description`] = step.description[1];
  }
}
TUTORIAL_MESSAGES.es = es;
TUTORIAL_MESSAGES.en = en;
