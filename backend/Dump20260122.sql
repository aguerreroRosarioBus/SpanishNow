-- MySQL dump 10.13  Distrib 8.0.44, for Win64 (x86_64)
--
-- Host: localhost    Database: spanishnow
-- ------------------------------------------------------
-- Server version	8.0.44

/*!40101 SET @OLD_CHARACTER_SET_CLIENT=@@CHARACTER_SET_CLIENT */;
/*!40101 SET @OLD_CHARACTER_SET_RESULTS=@@CHARACTER_SET_RESULTS */;
/*!40101 SET @OLD_COLLATION_CONNECTION=@@COLLATION_CONNECTION */;
/*!50503 SET NAMES utf8 */;
/*!40103 SET @OLD_TIME_ZONE=@@TIME_ZONE */;
/*!40103 SET TIME_ZONE='+00:00' */;
/*!40014 SET @OLD_UNIQUE_CHECKS=@@UNIQUE_CHECKS, UNIQUE_CHECKS=0 */;
/*!40014 SET @OLD_FOREIGN_KEY_CHECKS=@@FOREIGN_KEY_CHECKS, FOREIGN_KEY_CHECKS=0 */;
/*!40101 SET @OLD_SQL_MODE=@@SQL_MODE, SQL_MODE='NO_AUTO_VALUE_ON_ZERO' */;
/*!40111 SET @OLD_SQL_NOTES=@@SQL_NOTES, SQL_NOTES=0 */;

--
-- Table structure for table `activity_configs`
--

DROP TABLE IF EXISTS `activity_configs`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `activity_configs` (
  `id` int NOT NULL AUTO_INCREMENT,
  `unitId` int NOT NULL,
  `activityType` enum('questions','flashcards','matching','listen_repeat') NOT NULL,
  `order` int NOT NULL,
  `isEnabled` tinyint(1) DEFAULT '1',
  `requiredStoryIds` json DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `activity_configs_unit_id` (`unitId`),
  KEY `activity_configs_unit_id_order` (`unitId`,`order`),
  CONSTRAINT `activity_configs_ibfk_1` FOREIGN KEY (`unitId`) REFERENCES `units` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=17 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `activity_configs`
--

LOCK TABLES `activity_configs` WRITE;
/*!40000 ALTER TABLE `activity_configs` DISABLE KEYS */;
INSERT INTO `activity_configs` VALUES (5,1,'questions',200,1,'[1]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(6,1,'flashcards',400,1,'[1, 2]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(7,1,'matching',600,1,'[]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(8,1,'listen_repeat',700,1,'[1, 2, 3]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(9,2,'questions',200,1,'[4]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(10,2,'matching',400,1,'[]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(11,2,'flashcards',600,1,'[4, 5, 6]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(12,2,'listen_repeat',700,1,'[4, 5, 6]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(13,3,'matching',200,1,'[]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(14,3,'questions',400,1,'[7, 8]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(15,3,'flashcards',600,1,'[7, 8, 9]','2026-01-15 12:16:11','2026-01-15 12:16:11'),(16,3,'listen_repeat',700,1,'[7, 8, 9]','2026-01-15 12:16:11','2026-01-15 12:16:11');
/*!40000 ALTER TABLE `activity_configs` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `courses`
--

DROP TABLE IF EXISTS `courses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `courses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `title` varchar(200) NOT NULL,
  `description` text,
  `level` enum('A1','A2','B1','B2','C1','C2') NOT NULL,
  `teacherId` int NOT NULL,
  `imageUrl` varchar(500) DEFAULT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `teacherId` (`teacherId`),
  CONSTRAINT `courses_ibfk_1` FOREIGN KEY (`teacherId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `courses`
--

LOCK TABLES `courses` WRITE;
/*!40000 ALTER TABLE `courses` DISABLE KEYS */;
INSERT INTO `courses` VALUES (1,'Espanol A1 - Completo','Curso completo con unidades, historias y actividades para probar el sistema de navegación','A1',1,NULL,'2025-12-27 21:40:56','2026-01-15 17:31:05'),(2,'Espanol A1','Espaniol para turistas y ocasional','A1',1,NULL,'2026-01-13 21:46:06','2026-01-13 21:46:06'),(3,'Ingles A1','Ingles para principiantes','A1',1,NULL,'2026-01-13 22:16:16','2026-01-13 22:16:16');
/*!40000 ALTER TABLE `courses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `enrollments`
--

DROP TABLE IF EXISTS `enrollments`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `enrollments` (
  `id` int NOT NULL AUTO_INCREMENT,
  `studentId` int NOT NULL,
  `courseId` int NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `questionsCompleted` tinyint(1) NOT NULL DEFAULT '0',
  `flashcardsCompleted` tinyint(1) NOT NULL DEFAULT '0',
  `matchingCompleted` tinyint(1) NOT NULL DEFAULT '0',
  `listenRepeatCompleted` tinyint(1) NOT NULL DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `studentId` (`studentId`),
  KEY `courseId` (`courseId`),
  CONSTRAINT `enrollments_ibfk_1` FOREIGN KEY (`studentId`) REFERENCES `users` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `enrollments_ibfk_2` FOREIGN KEY (`courseId`) REFERENCES `courses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=4 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `enrollments`
--

LOCK TABLES `enrollments` WRITE;
/*!40000 ALTER TABLE `enrollments` DISABLE KEYS */;
INSERT INTO `enrollments` VALUES (1,2,1,'2025-12-27 21:45:10','2026-01-15 16:19:06',0,0,0,0);
/*!40000 ALTER TABLE `enrollments` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `progress`
--

DROP TABLE IF EXISTS `progress`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `progress` (
  `id` int NOT NULL AUTO_INCREMENT,
  `enrollmentId` int NOT NULL,
  `storyId` int NOT NULL,
  `completed` tinyint(1) NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `activitiesCompleted` tinyint(1) NOT NULL DEFAULT '0',
  `flashcardsViewed` tinyint(1) DEFAULT '0',
  `questionsCompleted` tinyint(1) DEFAULT '0',
  `matchingCompleted` tinyint(1) DEFAULT '0',
  `listenRepeatCompleted` tinyint(1) DEFAULT '0',
  PRIMARY KEY (`id`),
  KEY `enrollmentId` (`enrollmentId`),
  KEY `storyId` (`storyId`),
  CONSTRAINT `progress_ibfk_1` FOREIGN KEY (`enrollmentId`) REFERENCES `enrollments` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `progress_ibfk_2` FOREIGN KEY (`storyId`) REFERENCES `stories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=9 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `progress`
--

LOCK TABLES `progress` WRITE;
/*!40000 ALTER TABLE `progress` DISABLE KEYS */;
INSERT INTO `progress` VALUES (1,1,1,1,'2026-01-10 22:42:11','2026-01-10 22:46:21',1,0,0,0,0),(7,1,2,1,'2026-01-15 15:27:48','2026-01-15 15:27:48',0,0,0,0,0),(8,1,3,1,'2026-01-15 16:05:44','2026-01-15 16:05:44',0,0,0,0,0);
/*!40000 ALTER TABLE `progress` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `question_responses`
--

DROP TABLE IF EXISTS `question_responses`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `question_responses` (
  `id` int NOT NULL AUTO_INCREMENT,
  `progressId` int NOT NULL,
  `questionId` int NOT NULL,
  `studentAnswer` varchar(200) COLLATE utf8mb4_unicode_ci NOT NULL,
  `isCorrect` tinyint(1) NOT NULL,
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_progress_question` (`progressId`,`questionId`),
  KEY `idx_question_responses_progress` (`progressId`),
  KEY `idx_question_responses_question` (`questionId`),
  CONSTRAINT `fk_question_responses_progress` FOREIGN KEY (`progressId`) REFERENCES `progress` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_question_responses_question` FOREIGN KEY (`questionId`) REFERENCES `questions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=15 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `question_responses`
--

LOCK TABLES `question_responses` WRITE;
/*!40000 ALTER TABLE `question_responses` DISABLE KEYS */;
INSERT INTO `question_responses` VALUES (9,1,18,'Sí',0,'2026-01-15 16:11:09','2026-01-15 16:11:09'),(10,1,19,'Juan',1,'2026-01-15 16:11:09','2026-01-15 16:11:09'),(11,1,20,'Sí',1,'2026-01-15 16:11:09','2026-01-15 16:11:09'),(12,1,21,'Maria',0,'2026-01-15 16:11:09','2026-01-15 16:11:09'),(13,1,22,'Argentina',0,'2026-01-15 16:11:09','2026-01-15 16:11:09'),(14,1,23,'Un cafe',1,'2026-01-15 16:11:09','2026-01-15 16:11:09');
/*!40000 ALTER TABLE `question_responses` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `questions`
--

DROP TABLE IF EXISTS `questions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `questions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `storyId` int NOT NULL,
  `questionText` text NOT NULL,
  `answerType` enum('yes_no','choice') NOT NULL DEFAULT 'yes_no',
  `options` json DEFAULT NULL COMMENT 'Array of options for choice questions',
  `correctAnswer` varchar(200) NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `storyId` (`storyId`),
  CONSTRAINT `questions_ibfk_1` FOREIGN KEY (`storyId`) REFERENCES `stories` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=24 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `questions`
--

LOCK TABLES `questions` WRITE;
/*!40000 ALTER TABLE `questions` DISABLE KEYS */;
INSERT INTO `questions` VALUES (6,4,'Maria y Juan son amigos?','yes_no','[\"Miguel\", \"Roberto\", \"Carlos\"]','Si','2026-01-15 12:16:11','2026-01-15 12:16:11'),(7,4,'┬┐Cu├íntos hermanos tiene Carlos?','choice','[\"Uno\", \"Dos\", \"Tres\"]','Dos','2026-01-15 12:16:11','2026-01-15 12:16:11'),(8,5,'┬┐C├│mo se llama el gato?','choice','[\"Toby\", \"Michi\", \"Felix\"]','Michi','2026-01-15 12:16:11','2026-01-15 12:16:11'),(9,5,'┬┐De qu├® color es el gato?','choice','[\"Blanco y negro\", \"Naranja\", \"Gris\"]','Blanco y negro','2026-01-15 12:16:11','2026-01-15 12:16:11'),(10,6,'┬┐Qu├® es Toby?','choice','[\"Un profesor\", \"Un m├®dico\", \"Un estudiante\"]','Un m├®dico','2026-01-15 12:16:11','2026-01-15 12:16:11'),(11,7,'┬┐Qu├® quiere comer Pedro?','choice','[\"Pasta\", \"Pizza y ensalada\", \"Hamburguesa\"]','Pizza y ensalada','2026-01-15 12:16:11','2026-01-15 12:16:11'),(12,7,'┬┐Qu├® quiere beber Pedro?','choice','[\"Caf├®\", \"Agua\", \"Jugo\"]','Agua','2026-01-15 12:16:11','2026-01-15 12:16:11'),(13,8,'┬┐Cu├íntas manzanas compra Mar├¡a?','choice','[\"Tres\", \"Cinco\", \"Diez\"]','Cinco','2026-01-15 12:16:11','2026-01-15 12:16:11'),(14,8,'┬┐Cu├ínto cuestan las manzanas?','choice','[\"Un euro\", \"Dos euros\", \"Tres euros\"]','Dos euros','2026-01-15 12:16:11','2026-01-15 12:16:11'),(15,9,'┬┐Cu├íntos a├▒os tiene Luis?','choice','[\"Quince\", \"Dieciocho\", \"Veinte\"]','Veinte','2026-01-15 12:16:11','2026-01-15 12:16:11'),(16,9,'┬┐Cu├íntos amigos invita Luis?','choice','[\"Diez\", \"Quince\", \"Veinte\"]','Quince','2026-01-15 12:16:11','2026-01-15 12:16:11'),(18,1,'Donde esta Maria?','yes_no',NULL,'En una fiesta','2026-01-15 12:55:56','2026-01-15 12:55:56'),(19,1,'Como se llama el amigo de Maria?','choice','[\"Pedro\", \"Juan\", \"Luis\"]','Juan','2026-01-15 12:55:56','2026-01-15 12:55:56'),(20,1,'Maria y Juan son amigos?','yes_no',NULL,'Si','2026-01-15 12:55:56','2026-01-15 12:55:56'),(21,2,'Como se llama la profesora?','choice','[\"Maria\", \"Ana\", \"Laura\"]','Ana','2026-01-15 12:55:56','2026-01-15 12:55:56'),(22,2,'De donde es Pedro?','choice','[\"Espana\", \"Argentina\", \"Mexico\"]','Mexico','2026-01-15 12:55:56','2026-01-15 12:55:56'),(23,3,'Que pide Luis?','choice','[\"Un te\", \"Un cafe\", \"Una soda\"]','Un cafe','2026-01-15 12:55:56','2026-01-15 12:55:56');
/*!40000 ALTER TABLE `questions` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `repetition_activities`
--

DROP TABLE IF EXISTS `repetition_activities`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `repetition_activities` (
  `id` int NOT NULL AUTO_INCREMENT,
  `storyId` int NOT NULL,
  `phrase` text COLLATE utf8mb4_unicode_ci NOT NULL COMMENT 'Spanish phrase to repeat',
  `audioUrl` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT 'URL to model pronunciation audio',
  `order` int NOT NULL DEFAULT '0' COMMENT 'Display order within the story',
  `createdAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updatedAt` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_repetition_activities_story` (`storyId`),
  KEY `idx_repetition_activities_order` (`order`),
  CONSTRAINT `fk_repetition_activities_story` FOREIGN KEY (`storyId`) REFERENCES `stories` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `repetition_activities`
--

LOCK TABLES `repetition_activities` WRITE;
/*!40000 ALTER TABLE `repetition_activities` DISABLE KEYS */;
INSERT INTO `repetition_activities` VALUES (1,1,'Como te llamas?',NULL,0,'2026-01-13 21:24:21','2026-01-13 21:24:21');
/*!40000 ALTER TABLE `repetition_activities` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `sequelizemeta`
--

DROP TABLE IF EXISTS `sequelizemeta`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sequelizemeta` (
  `name` varchar(255) COLLATE utf8mb3_unicode_ci NOT NULL,
  PRIMARY KEY (`name`),
  UNIQUE KEY `name` (`name`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb3 COLLATE=utf8mb3_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `sequelizemeta`
--

LOCK TABLES `sequelizemeta` WRITE;
/*!40000 ALTER TABLE `sequelizemeta` DISABLE KEYS */;
INSERT INTO `sequelizemeta` VALUES ('20260115131716-create-activity-config.js'),('20260115132247-add-activity-flags-to-enrollment.js');
/*!40000 ALTER TABLE `sequelizemeta` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `stories`
--

DROP TABLE IF EXISTS `stories`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `stories` (
  `id` int NOT NULL AUTO_INCREMENT,
  `unitId` int NOT NULL,
  `title` varchar(200) NOT NULL,
  `text` text NOT NULL,
  `audioSlowUrl` varchar(500) DEFAULT NULL COMMENT 'URL for slow version audio',
  `audioNormalUrl` varchar(500) DEFAULT NULL COMMENT 'URL for normal speed audio',
  `order` int NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `unitId` (`unitId`),
  CONSTRAINT `stories_ibfk_1` FOREIGN KEY (`unitId`) REFERENCES `units` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=10 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `stories`
--

LOCK TABLES `stories` WRITE;
/*!40000 ALTER TABLE `stories` DISABLE KEYS */;
INSERT INTO `stories` VALUES (1,1,'Maria en la Fiesta','Maria va a una fiesta. En la fiesta hay muchas personas. Maria ve a Juan. Maria dice: \"Hola, como te llamas?\". Juan responde: \"Me llamo Juan, y tu?\". Maria dice: \"Yo me llamo Maria, mucho gusto\". Juan y Maria son amigos ahora.',NULL,NULL,2,'2025-12-27 22:01:49','2026-01-15 17:07:50'),(2,1,'El Primer Dia de Clase','Hoy es el primer dia de clase. La profesora se llama Ana. Ana dice: \"Buenos dias, yo soy la profesora Ana\". Los estudiantes dicen: \"Buenos dias, profesora\". Un estudiante se llama Pedro. Pedro dice: \"Hola, me llamo Pedro, soy de Mexico\".',NULL,NULL,0,'2026-01-13 21:48:44','2026-01-15 17:07:49'),(3,1,'En el Cafe','Luis entra en un cafe. El camarero dice: \"Buenas tardes, que desea?\". Luis responde: \"Buenas tardes, un cafe por favor\". El camarero pregunta: \"Como se llama usted?\". Luis dice: \"Me llamo Luis\". El camarero sonrie.',NULL,NULL,1,'2026-01-13 21:49:55','2026-01-15 17:07:50'),(4,2,'La Familia de Carlos','Carlos tiene una familia grande. Su padre se llama Roberto y su madre se llama Elena. Carlos tiene dos hermanos: una hermana que se llama Laura y un hermano que se llama Miguel. Laura tiene diez anos y Miguel tiene cinco anos. La familia de Carlos es muy feliz.',NULL,NULL,100,'2026-01-13 22:25:01','2026-01-15 12:16:11'),(5,2,'El Gato de Ana','Ana tiene un gato. El gato se llama Michi. Michi es blanco y negro. Michi come pescado y duerme mucho. Ana ama a Michi. Michi es el mejor amigo de Ana. Cada dia, Ana y Michi juegan juntos.',NULL,NULL,300,'2026-01-13 22:56:41','2026-01-15 12:16:11'),(6,2,'El Perro Doctor','Hay un perro que se llama Toby. Toby no es un perro normal, Toby es medico. Toby tiene una clinica veterinaria. Toby ayuda a muchos animales: gatos, pajaros, conejos. Los animales aman al Doctor Toby. Toby es un heroe.',NULL,NULL,500,'2026-01-15 12:16:11','2026-01-15 12:16:11'),(7,3,'En el Restaurante','Pedro va al restaurante. El camarero pregunta: \"Que desea comer?\". Pedro dice: \"Quiero pizza y ensalada, por favor\". El camarero pregunta: \"Y para beber?\". Pedro responde: \"Agua, por favor\". La comida esta deliciosa. Pedro esta muy feliz.',NULL,NULL,100,'2026-01-15 12:16:11','2026-01-15 12:16:11'),(8,3,'El Mercado de Frutas','Maria va al mercado. En el mercado hay muchas frutas: manzanas, naranjas, platanos, fresas. Maria compra cinco manzanas y tres naranjas. Las manzanas cuestan dos euros. Las naranjas cuestan un euro. Maria paga tres euros en total.',NULL,NULL,300,'2026-01-15 12:16:11','2026-01-15 12:16:11'),(9,3,'La Fiesta de Cumpleanos','Hoy es el cumpleanos de Luis. Luis tiene veinte anos. Hay una fiesta grande. En la fiesta hay un pastel enorme con veinte velas. Tambi├®n hay pizza, refrescos y helado. Luis invita a quince amigos. Todos cantan \"Feliz Cumpleanos\". Luis esta muy contento.',NULL,NULL,500,'2026-01-15 12:16:11','2026-01-15 12:16:11');
/*!40000 ALTER TABLE `stories` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `units`
--

DROP TABLE IF EXISTS `units`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `units` (
  `id` int NOT NULL AUTO_INCREMENT,
  `courseId` int NOT NULL,
  `title` varchar(200) NOT NULL,
  `description` text,
  `order` int NOT NULL DEFAULT '0',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  KEY `courseId` (`courseId`),
  CONSTRAINT `units_ibfk_1` FOREIGN KEY (`courseId`) REFERENCES `courses` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=6 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `units`
--

LOCK TABLES `units` WRITE;
/*!40000 ALTER TABLE `units` DISABLE KEYS */;
INSERT INTO `units` VALUES (1,1,'Saludos y Presentaciones','Aprende a saludar y presentarte en espanol',0,'2025-12-27 22:01:32','2026-01-15 17:32:53'),(2,1,'La Familia y Los Animales','Aprende sobre la familia y los animales',1,'2026-01-13 21:47:20','2026-01-15 17:32:58'),(3,1,'Comida y Numeros','Aprende sobre la comida y los numeros',2,'2026-01-13 21:47:44','2026-01-15 17:33:02'),(5,3,'Verb to be','aefeafaeaefeaf',0,'2026-01-13 22:24:48','2026-01-13 22:24:48');
/*!40000 ALTER TABLE `units` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `users`
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `name` varchar(100) NOT NULL,
  `email` varchar(100) NOT NULL,
  `password` varchar(255) NOT NULL,
  `role` enum('teacher','student') NOT NULL DEFAULT 'student',
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `users`
--

LOCK TABLES `users` WRITE;
/*!40000 ALTER TABLE `users` DISABLE KEYS */;
INSERT INTO `users` VALUES (1,'Andres','admin@gmail.com','$2b$10$meYP8mgiumEBWW3rUYCtuOKlLOlRRLO0PLzFVURElZwWJhyVBYbEy','teacher','2025-12-27 21:25:19','2025-12-27 21:25:19'),(2,'lucas','lucas@gmail.com','$2b$10$Z9jjeW8n2WB6Ki6CtUPzguVDDP/dDsd9tvcB10BEY6JtCZO0o9zMa','student','2025-12-27 21:44:58','2025-12-27 21:44:58');
/*!40000 ALTER TABLE `users` ENABLE KEYS */;
UNLOCK TABLES;

--
-- Table structure for table `vocabulary`
--

DROP TABLE IF EXISTS `vocabulary`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `vocabulary` (
  `id` int NOT NULL AUTO_INCREMENT,
  `unitId` int NOT NULL,
  `word` varchar(100) NOT NULL,
  `translation` varchar(100) NOT NULL,
  `createdAt` datetime NOT NULL,
  `updatedAt` datetime NOT NULL,
  `example` text COMMENT 'Example sentence using the word',
  `partOfSpeech` varchar(50) DEFAULT NULL COMMENT 'noun, verb, adjective, adverb, etc.',
  `audioUrl` varchar(500) DEFAULT NULL COMMENT 'URL to pronunciation audio file',
  `imageUrl` varchar(500) DEFAULT NULL COMMENT 'URL to visual representation image',
  PRIMARY KEY (`id`),
  KEY `unitId` (`unitId`),
  KEY `idx_vocabulary_part_of_speech` (`partOfSpeech`),
  CONSTRAINT `vocabulary_ibfk_1` FOREIGN KEY (`unitId`) REFERENCES `units` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=25 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Dumping data for table `vocabulary`
--

LOCK TABLES `vocabulary` WRITE;
/*!40000 ALTER TABLE `vocabulary` DISABLE KEYS */;
INSERT INTO `vocabulary` VALUES (1,1,'Hola','Hello','2026-01-13 21:23:51','2026-01-15 12:16:11',NULL,NULL,NULL,NULL),(2,1,'Me llamo','My name is','2026-01-15 12:16:11','2026-01-15 12:16:11','Me llamo Mar├¡a','phrase',NULL,NULL),(3,1,'Mucho gusto','Nice to meet you','2026-01-15 12:16:11','2026-01-15 12:16:11','Mucho gusto, Juan','phrase',NULL,NULL),(4,1,'Buenos d├¡as','Good morning','2026-01-15 12:16:11','2026-01-15 12:16:11','Buenos d├¡as, profesora','phrase',NULL,NULL),(5,1,'Buenas tardes','Good afternoon','2026-01-15 12:16:11','2026-01-15 12:16:11','Buenas tardes, se├▒or','phrase',NULL,NULL),(6,1,'Gracias','Thank you','2026-01-15 12:16:11','2026-01-15 12:16:11','Gracias por el caf├®','interjection',NULL,NULL),(7,2,'Familia','Family','2026-01-15 12:16:11','2026-01-15 12:16:11','Mi familia es grande','noun',NULL,NULL),(8,2,'Padre','Father','2026-01-15 12:16:11','2026-01-15 12:16:11','Mi padre se llama Juan','noun',NULL,NULL),(9,2,'Madre','Mother','2026-01-15 12:16:11','2026-01-15 12:16:11','Mi madre es profesora','noun',NULL,NULL),(10,2,'Hermano','Brother','2026-01-15 12:16:11','2026-01-15 12:16:11','Tengo un hermano','noun',NULL,NULL),(11,2,'Hermana','Sister','2026-01-15 12:16:11','2026-01-15 12:16:11','Mi hermana tiene ocho a├▒os','noun',NULL,NULL),(12,2,'Gato','Cat','2026-01-15 12:16:11','2026-01-15 12:16:11','El gato es blanco','noun',NULL,NULL),(13,2,'Perro','Dog','2026-01-15 12:16:11','2026-01-15 12:16:11','El perro es grande','noun',NULL,NULL),(14,2,'Animal','Animal','2026-01-15 12:16:11','2026-01-15 12:16:11','Los animales son importantes','noun',NULL,NULL),(15,3,'Comida','Food','2026-01-15 12:16:11','2026-01-15 12:16:11','La comida est├í deliciosa','noun',NULL,NULL),(16,3,'Pizza','Pizza','2026-01-15 12:16:11','2026-01-15 12:16:11','Quiero una pizza','noun',NULL,NULL),(17,3,'Agua','Water','2026-01-15 12:16:11','2026-01-15 12:16:11','Bebo agua','noun',NULL,NULL),(18,3,'Fruta','Fruit','2026-01-15 12:16:11','2026-01-15 12:16:11','La fruta es saludable','noun',NULL,NULL),(19,3,'Manzana','Apple','2026-01-15 12:16:11','2026-01-15 12:16:11','La manzana es roja','noun',NULL,NULL),(20,3,'Naranja','Orange','2026-01-15 12:16:11','2026-01-15 12:16:11','La naranja es dulce','noun',NULL,NULL),(21,3,'Uno','One','2026-01-15 12:16:11','2026-01-15 12:16:11','Tengo un gato','number',NULL,NULL),(22,3,'Dos','Two','2026-01-15 12:16:11','2026-01-15 12:16:11','Dos manzanas','number',NULL,NULL),(23,3,'Tres','Three','2026-01-15 12:16:11','2026-01-15 12:16:11','Tres naranjas','number',NULL,NULL),(24,3,'Cinco','Five','2026-01-15 12:16:11','2026-01-15 12:16:11','Cinco euros','number',NULL,NULL);
/*!40000 ALTER TABLE `vocabulary` ENABLE KEYS */;
UNLOCK TABLES;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2026-01-22 20:27:43
