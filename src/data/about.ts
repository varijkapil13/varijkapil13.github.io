// Per-language content for the About page. Shared labels live in i18n/translations.ts.

export const aboutData = {
  en: {
    experience: [
      {
        company: "Digital Automotive",
        role: "Head of Backend Software Engineering",
        period: "Apr 2024 - Present",
        location: "Cologne Bonn Region, Germany · Remote",
        description: "I lead about 15 engineers across backend development and operations, moving Digital Automotive from a legacy monolith to a multi-tenant SaaS platform.",
        highlights: [
          "Platform modernization: Architected and led migration from JavaEE modular monolith to ~15 microservices using domain-driven design. Applied strangler fig pattern for incremental migration. Migrated core modules to Quarkus and transitioned from VM-per-customer to shared Kubernetes infrastructure with namespace-per-tenant isolation.",
          "Global, secure architecture: Designing geo-replicated infrastructure for global availability. Introduced HashiCorp Vault for secrets management with automated credential rotation. Driving compliance with GDPR, TISAX, and ISO 27001.",
          "Operations: Replaced fragile, manually triggered pipelines with GitOps using Pulumi and Helm. Added distributed tracing and metrics across all services.",
          "Engineering practices: Brought Claude into developer workflows. Reworked code review around AI-assisted analysis, Qodana, and SonarQube. Introduced ADRs for architectural decision-making. Documented platform architecture using arc42.",
          "Team and org development: Scaled the team through direct hiring and introduced offshore hiring practices. Restructured organization using Team Topologies, transitioning from managing individual contributors to leading team leads.",
        ],
      },
      {
        company: "Capgemini",
        role: "Lead Software Engineer",
        period: "Mar 2023 - Mar 2024",
        location: "Cologne Bonn Region, Germany · Hybrid",
        description: "Led software engineering initiatives for enterprise clients, focusing on backend development and continuous integration practices.",
        highlights: [
          "Delivered enterprise software solutions for major clients",
          "Set up CI/CD and development workflows for client teams",
          "Mentored team members and conducted technical reviews",
        ],
      },
      {
        company: "IT Manufactory GmbH",
        role: "Head of Backend Software Development",
        period: "Jun 2021 - Feb 2023",
        location: "Bonn, Germany · Remote",
        description: "Led the backend development team for the Digital Automotive platform, an enterprise solution serving the automotive industry.",
        highlights: [
          "Led backend development team and technical architecture decisions",
          "Architected and implemented OAuth 2.0 and OpenID Connect authentication system",
          "Coordinated database migration from Oracle to PostgreSQL",
          "Migrated application server from GlassFish to Payara",
          "Established CI/CD pipelines with GitLab",
        ],
      },
      {
        company: "IT Manufactory GmbH",
        role: "Software Developer",
        period: "Nov 2017 - Jun 2021",
        location: "Passau, Bavaria, Germany",
        description: "Full-stack developer working on the Digital Automotive enterprise platform with Java backend and web frontend.",
        highlights: [
          "Developed core modules for Strategy, Acquisition, Business and Claim Management",
          "Built reporting and analytics features",
          "Implemented REST APIs and backend services with Java/Jakarta EE",
          "Conducted code reviews and mentored junior developers",
        ],
      },
      {
        company: "NetSet Software Pvt. Ltd",
        role: "Mobile Application Developer",
        period: "Aug 2014 - Aug 2015",
        location: "Chandigarh Area, India",
        description: "iOS application developer building native mobile applications for various clients.",
        highlights: [
          "Developed multiple iOS applications from concept to App Store deployment",
          "Built enterprise applications with offline-first capabilities",
          "Created social media and consumer applications",
        ],
      },
      {
        company: "RF Silicon Pvt Ltd",
        role: "Trainee Engineer",
        period: "Dec 2013 - Jun 2014",
        location: "New Delhi, India",
        description: "Internship focused on Bluetooth Low Energy (BLE) development for IoT devices.",
        highlights: [
          "Bluetooth LE profile implementation for health devices",
          "Algorithm formulation for Security Manager Layer",
          "iOS application development for BLE device communication",
        ],
      },
    ],

    education: [
      {
        degree: "M.Sc. Informatik (Computer Science)",
        school: "Universität Passau",
        period: "2015 - 2017",
        location: "Passau, Germany",
        thesis: "Towards an Assembly Line for the Construction of Complex Machine Learning Algorithms",
        note: "Focus areas: Software Engineering, Machine Learning, Distributed Systems",
      },
      {
        degree: "B.Tech Computer Science & Engineering",
        school: "Bhaddal Institutes",
        period: "2010 - 2014",
        location: "Punjab, India",
        note: "Activities: Annual Cultural and Technical Fest Core Organizer, ISTE Member, Robotics Society",
      },
    ],

    interests: [
      "Platform Modernization",
      "Cloud-Native Architecture",
      "Kubernetes",
      "Team Topologies",
      "Cycling",
      "Badminton",
      "Open Source",
    ],

    certifications: [
      "Liquibase Certified Practitioner",
      "Microsoft Certified: Azure Fundamentals",
    ],

    projects: [
      {
        name: "Visualisation of BFT-SMaRt",
        period: "Mar 2017 - May 2017",
        association: "Universität Passau",
        description: "A visualization library for BFT-SmaRt distributed system that shows system diagram, system statistics, messages exchanges and total number of message exchanges between the servers and the client. Visualizations built in D3.js.",
        technologies: ["Apache Kafka", "D3.js", "Python", "Node.js", "Java"],
      },
      {
        name: "BETO: Better Together",
        period: "Feb 2017 - Apr 2017",
        association: "Universität Passau",
        description: "A community app where people can offer help and time in categories like companionship, language lessons, cooking nights, or starting a band. Organizations can host events like football tournaments or parties. Features integrated chat with automated translation.",
        technologies: ["Mobile Development", "Real-time Chat", "Translation API"],
      },
      {
        name: "CoRE Directories: Web Of Things",
        period: "Oct 2016 - Feb 2017",
        association: "Universität Passau",
        description: "Implemented CoRE Directory discovery method for Web of Things initiative using COAP protocol. IoT devices connecting to the network are automatically added to a directory with descriptions of their functions and services.",
        technologies: ["COAP", "Node.js", "PostgreSQL", "Intel Galileo", "Java"],
      },
      {
        name: "FriendFinder",
        period: "Oct 2015 - Feb 2016",
        association: "Universität Passau",
        description: "An iOS application to find people with similar interests near you. Backed by a Machine Learning backend using NLP algorithms to match interests from Facebook profiles and user descriptions.",
        technologies: ["Swift", "Python", "Apache Lucene", "NLP", "iOS"],
      },
    ],
  },
  de: {
    experience: [
      {
        company: "Digital Automotive",
        role: "Head of Backend Software Engineering",
        period: "Apr 2024 - Heute",
        location: "Region Köln/Bonn, Deutschland · Remote",
        description: "Leitung eines Teams von ~15 Ingenieuren in Backend-Entwicklung und Operations, Steuerung der Transformation von Digital Automotive von einem Legacy-Monolithen zu einer modernen, mandantenfähigen SaaS-Plattform.",
        highlights: [
          "Plattform-Modernisierung: Architektur und Leitung der Migration von JavaEE-Monolith zu ~15 Microservices mit Domain-Driven Design. Anwendung des Strangler-Fig-Patterns für inkrementelle Migration. Migration von Kernmodulen zu Quarkus und Übergang von VM-pro-Kunde zu geteilter Kubernetes-Infrastruktur mit Namespace-pro-Mandant-Isolation.",
          "Globale & sichere Architektur: Design geo-replizierter Infrastruktur für globale Verfügbarkeit. Einführung von HashiCorp Vault für Secrets-Management mit automatisierter Credential-Rotation. Einhaltung von GDPR, TISAX und ISO 27001.",
          "Operations-Transformation: Ersetzung fragiler, manuell getriggerter Pipelines durch GitOps-Praktiken mit Pulumi und Helm. Implementierung umfassender Observability mit verteiltem Tracing und Metriken über alle Services.",
          "Engineering Excellence: Integration von KI in Entwickler-Workflows mit Claude. Transformation von Code-Review-Prozessen mit KI-gesteuerter Analyse, Qodana und SonarQube. Einführung von ADRs für Architekturentscheidungen. Plattform-Dokumentation mit arc42.",
          "Team- & Org-Entwicklung: Skalierung des Teams durch direkte Einstellungen und Einführung von Offshore-Hiring-Praktiken. Umstrukturierung der Organisation mit Team Topologies, Übergang von der Führung einzelner Mitarbeiter zur Führung von Teamleitern.",
        ],
      },
      {
        company: "Capgemini",
        role: "Lead Software Engineer",
        period: "März 2023 - März 2024",
        location: "Region Köln/Bonn, Deutschland · Hybrid",
        description: "Leitung von Software-Engineering-Initiativen für Enterprise-Kunden mit Fokus auf Backend-Entwicklung und Continuous-Integration-Praktiken.",
        highlights: [
          "Lieferung von Enterprise-Software-Lösungen für große Kunden",
          "Etablierung von CI/CD-Best-Practices und Entwicklungs-Workflows",
          "Mentoring von Teammitgliedern und technische Reviews",
        ],
      },
      {
        company: "IT Manufactory GmbH",
        role: "Head of Backend Software Development",
        period: "Juni 2021 - Feb 2023",
        location: "Bonn, Deutschland · Remote",
        description: "Leitung des Backend-Entwicklungsteams für die Digital Automotive Plattform, eine Enterprise-Lösung für die Automobilindustrie.",
        highlights: [
          "Leitung des Backend-Teams und technische Architekturentscheidungen",
          "Architektur und Implementierung des OAuth 2.0 und OpenID Connect Authentifizierungssystems",
          "Koordination der Datenbankmigration von Oracle zu PostgreSQL",
          "Migration des Applikationsservers von GlassFish zu Payara",
          "Etablierung von CI/CD-Pipelines mit GitLab",
        ],
      },
      {
        company: "IT Manufactory GmbH",
        role: "Software Developer",
        period: "Nov 2017 - Juni 2021",
        location: "Passau, Bayern, Deutschland",
        description: "Full-Stack-Entwickler für die Digital Automotive Enterprise-Plattform mit Java-Backend und Web-Frontend.",
        highlights: [
          "Entwicklung von Kernmodulen für Strategie, Akquisition, Business und Claim Management",
          "Aufbau umfassender Reporting- und Analyse-Features",
          "Implementierung von REST-APIs und Backend-Services mit Java/Jakarta EE",
          "Code-Reviews und Mentoring von Junior-Entwicklern",
        ],
      },
      {
        company: "NetSet Software Pvt. Ltd",
        role: "Mobile Application Developer",
        period: "Aug 2014 - Aug 2015",
        location: "Chandigarh, Indien",
        description: "iOS-Anwendungsentwickler für native Mobile-Applikationen verschiedener Kunden.",
        highlights: [
          "Entwicklung mehrerer iOS-Anwendungen vom Konzept bis zur App-Store-Veröffentlichung",
          "Erstellung von Enterprise-Anwendungen mit Offline-First-Funktionalität",
          "Entwicklung von Social-Media- und Consumer-Anwendungen",
        ],
      },
      {
        company: "RF Silicon Pvt Ltd",
        role: "Trainee Engineer",
        period: "Dez 2013 - Juni 2014",
        location: "Neu-Delhi, Indien",
        description: "Praktikum mit Fokus auf Bluetooth Low Energy (BLE) Entwicklung für IoT-Geräte.",
        highlights: [
          "Bluetooth-LE-Profil-Implementierung für Gesundheitsgeräte",
          "Algorithmus-Formulierung für Security Manager Layer",
          "iOS-Anwendungsentwicklung für BLE-Gerätekommunikation",
        ],
      },
    ],

    education: [
      {
        degree: "M.Sc. Informatik",
        school: "Universität Passau",
        period: "2015 - 2017",
        location: "Passau, Deutschland",
        thesis: "Towards an Assembly Line for the Construction of Complex Machine Learning Algorithms",
        note: "Schwerpunkte: Software Engineering, Machine Learning, Verteilte Systeme",
      },
      {
        degree: "B.Tech Computer Science & Engineering",
        school: "Bhaddal Institutes",
        period: "2010 - 2014",
        location: "Punjab, Indien",
        note: "Aktivitäten: Kernorganisator des jährlichen Kultur- und Technik-Fests, ISTE-Mitglied, Robotik-Gesellschaft",
      },
    ],

    interests: [
      "Plattform-Modernisierung",
      "Cloud-Native Architektur",
      "Kubernetes",
      "Team Topologies",
      "Radfahren",
      "Badminton",
      "Open Source",
    ],

    certifications: [
      "Liquibase Certified Practitioner",
      "Microsoft Certified: Azure Fundamentals",
    ],

    projects: [
      {
        name: "Visualisation of BFT-SMaRt",
        period: "März 2017 - Mai 2017",
        association: "Universität Passau",
        description: "Eine Visualisierungsbibliothek für das BFT-SmaRt verteilte System, die Systemdiagramme, Systemstatistiken, Nachrichtenaustausch und Gesamtzahl der Nachrichtenaustausche zwischen Servern und Client zeigt. Visualisierungen mit D3.js erstellt.",
        technologies: ["Apache Kafka", "D3.js", "Python", "Node.js", "Java"],
      },
      {
        name: "BETO: Better Together",
        period: "Feb 2017 - Apr 2017",
        association: "Universität Passau",
        description: "Eine Community-App, in der Menschen Hilfe und Zeit in verschiedenen Kategorien anbieten können – Gesellschaft, Sprachunterricht, Kochabende oder Bandgründung. Organisationen können Events wie Fußballturniere oder Partys veranstalten. Integrierter Chat mit automatischer Übersetzung.",
        technologies: ["Mobile Development", "Real-time Chat", "Translation API"],
      },
      {
        name: "CoRE Directories: Web Of Things",
        period: "Okt 2016 - Feb 2017",
        association: "Universität Passau",
        description: "Implementierung der CoRE Directory Discovery-Methode für die Web of Things Initiative mit COAP-Protokoll. IoT-Geräte werden bei Netzwerkverbindung automatisch mit Beschreibungen ihrer Funktionen und Services zum Verzeichnis hinzugefügt.",
        technologies: ["COAP", "Node.js", "PostgreSQL", "Intel Galileo", "Java"],
      },
      {
        name: "FriendFinder",
        period: "Okt 2015 - Feb 2016",
        association: "Universität Passau",
        description: "Eine iOS-Anwendung zum Finden von Menschen mit ähnlichen Interessen in der Nähe. Unterstützt durch ein Machine-Learning-Backend mit NLP-Algorithmen zum Abgleich von Interessen aus Facebook-Profilen und Nutzerbeschreibungen.",
        technologies: ["Swift", "Python", "Apache Lucene", "NLP", "iOS"],
      },
    ],
  },
  hi: {
    experience: [
      {
        company: "Digital Automotive",
        role: "Head of Backend Software Engineering",
        period: "अप्रैल 2024 - वर्तमान",
        location: "कोलोन बॉन क्षेत्र, जर्मनी · रिमोट",
        description: "~15 इंजीनियरों की टीम का नेतृत्व बैकएंड डेवलपमेंट और ऑपरेशंस में, Digital Automotive के लीगेसी मोनोलिथ से आधुनिक, मल्टी-टेनेंट SaaS प्लेटफॉर्म में ट्रांसफॉर्मेशन का नेतृत्व।",
        highlights: [
          "प्लेटफॉर्म आधुनिकीकरण: JavaEE मॉड्यूलर मोनोलिथ से ~15 माइक्रोसर्विसेज में माइग्रेशन का आर्किटेक्चर और नेतृत्व डोमेन-ड्रिवन डिज़ाइन के साथ। इंक्रीमेंटल माइग्रेशन के लिए स्ट्रैंगलर फिग पैटर्न। कोर मॉड्यूल्स का Quarkus में माइग्रेशन और VM-प्रति-ग्राहक से शेयर्ड Kubernetes इन्फ्रास्ट्रक्चर में ट्रांजिशन।",
          "ग्लोबल और सुरक्षित आर्किटेक्चर: वैश्विक उपलब्धता के लिए जियो-रेप्लिकेटेड इन्फ्रास्ट्रक्चर डिज़ाइन। ऑटोमेटेड क्रेडेंशियल रोटेशन के साथ सीक्रेट्स मैनेजमेंट के लिए HashiCorp Vault। GDPR, TISAX, और ISO 27001 अनुपालन।",
          "ऑपरेशंस ट्रांसफॉर्मेशन: फ्रैजाइल, मैन्युअली-ट्रिगर्ड पाइपलाइन्स को Pulumi और Helm के साथ GitOps प्रैक्टिसेज से बदलना। सभी सर्विसेज में डिस्ट्रिब्यूटेड ट्रेसिंग और मेट्रिक्स के साथ कॉम्प्रिहेंसिव observability।",
          "इंजीनियरिंग एक्सीलेंस: Claude के साथ डेवलपर वर्कफ्लोज़ में AI। AI-ड्रिवन एनालिसिस, Qodana, और SonarQube के साथ कोड रिव्यू प्रोसेस ट्रांसफॉर्म। आर्किटेक्चर निर्णयों के लिए ADRs। arc42 से प्लेटफॉर्म डॉक्यूमेंटेशन।",
          "टीम और Org डेवलपमेंट: डायरेक्ट हायरिंग और ऑफशोर हायरिंग प्रैक्टिसेज से टीम स्केलिंग। Team Topologies से संगठन पुनर्गठन, इंडिविजुअल कंट्रीब्यूटर्स से टीम लीड्स के नेतृत्व में ट्रांजिशन।",
        ],
      },
      {
        company: "Capgemini",
        role: "Lead Software Engineer",
        period: "मार्च 2023 - मार्च 2024",
        location: "कोलोन बॉन क्षेत्र, जर्मनी · हाइब्रिड",
        description: "एंटरप्राइज क्लाइंट्स के लिए सॉफ्टवेयर इंजीनियरिंग इनिशिएटिव्स का नेतृत्व, बैकएंड डेवलपमेंट और कंटीन्यूअस इंटीग्रेशन प्रैक्टिसेज पर फोकस।",
        highlights: [
          "प्रमुख क्लाइंट्स के लिए एंटरप्राइज सॉफ्टवेयर सॉल्यूशंस डिलीवरी",
          "CI/CD बेस्ट प्रैक्टिसेज और डेवलपमेंट वर्कफ्लोज़ की स्थापना",
          "टीम मेंबर्स का मेंटरिंग और टेक्निकल रिव्यूज़",
        ],
      },
      {
        company: "IT Manufactory GmbH",
        role: "Head of Backend Software Development",
        period: "जून 2021 - फरवरी 2023",
        location: "बॉन, जर्मनी · रिमोट",
        description: "Digital Automotive प्लेटफॉर्म के लिए बैकएंड डेवलपमेंट टीम का नेतृत्व, ऑटोमोटिव इंडस्ट्री के लिए एंटरप्राइज सॉल्यूशन।",
        highlights: [
          "बैकएंड डेवलपमेंट टीम और टेक्निकल आर्किटेक्चर निर्णयों का नेतृत्व",
          "OAuth 2.0 और OpenID Connect ऑथेंटिकेशन सिस्टम का आर्किटेक्चर और इम्प्लीमेंटेशन",
          "Oracle से PostgreSQL में डेटाबेस माइग्रेशन का कोऑर्डिनेशन",
          "GlassFish से Payara में एप्लिकेशन सर्वर माइग्रेशन",
          "GitLab के साथ CI/CD पाइपलाइन्स की स्थापना",
        ],
      },
      {
        company: "IT Manufactory GmbH",
        role: "Software Developer",
        period: "नवंबर 2017 - जून 2021",
        location: "पासाउ, बवेरिया, जर्मनी",
        description: "Java बैकएंड और वेब फ्रंटएंड के साथ Digital Automotive एंटरप्राइज प्लेटफॉर्म पर फुल-स्टैक डेवलपर।",
        highlights: [
          "Strategy, Acquisition, Business और Claim Management के लिए कोर मॉड्यूल्स का डेवलपमेंट",
          "कॉम्प्रिहेंसिव रिपोर्टिंग और एनालिटिक्स फीचर्स का निर्माण",
          "Java/Jakarta EE के साथ REST APIs और बैकएंड सर्विसेज का इम्प्लीमेंटेशन",
          "कोड रिव्यूज़ और जूनियर डेवलपर्स का मेंटरिंग",
        ],
      },
      {
        company: "NetSet Software Pvt. Ltd",
        role: "Mobile Application Developer",
        period: "अगस्त 2014 - अगस्त 2015",
        location: "चंडीगढ़ क्षेत्र, भारत",
        description: "विभिन्न क्लाइंट्स के लिए नेटिव मोबाइल एप्लिकेशंस बनाने वाला iOS एप्लिकेशन डेवलपर।",
        highlights: [
          "कॉन्सेप्ट से App Store डिप्लॉयमेंट तक कई iOS एप्लिकेशंस का डेवलपमेंट",
          "ऑफलाइन-फर्स्ट कैपेबिलिटीज के साथ एंटरप्राइज एप्लिकेशंस",
          "सोशल मीडिया और कंज्यूमर एप्लिकेशंस का निर्माण",
        ],
      },
      {
        company: "RF Silicon Pvt Ltd",
        role: "Trainee Engineer",
        period: "दिसंबर 2013 - जून 2014",
        location: "नई दिल्ली, भारत",
        description: "IoT डिवाइसेज के लिए Bluetooth Low Energy (BLE) डेवलपमेंट पर फोकस्ड इंटर्नशिप।",
        highlights: [
          "हेल्थ डिवाइसेज के लिए Bluetooth LE प्रोफाइल इम्प्लीमेंटेशन",
          "Security Manager Layer के लिए एल्गोरिदम फॉर्मूलेशन",
          "BLE डिवाइस कम्युनिकेशन के लिए iOS एप्लिकेशन डेवलपमेंट",
        ],
      },
    ],

    education: [
      {
        degree: "M.Sc. Informatik (कंप्यूटर साइंस)",
        school: "Universität Passau",
        period: "2015 - 2017",
        location: "पासाउ, जर्मनी",
        thesis: "Towards an Assembly Line for the Construction of Complex Machine Learning Algorithms",
        note: "फोकस क्षेत्र: सॉफ्टवेयर इंजीनियरिंग, मशीन लर्निंग, डिस्ट्रिब्यूटेड सिस्टम्स",
      },
      {
        degree: "B.Tech Computer Science & Engineering",
        school: "Bhaddal Institutes",
        period: "2010 - 2014",
        location: "पंजाब, भारत",
        note: "गतिविधियाँ: वार्षिक सांस्कृतिक और तकनीकी उत्सव कोर आयोजक, ISTE सदस्य, रोबोटिक्स सोसाइटी",
      },
    ],

    interests: [
      "प्लेटफॉर्म आधुनिकीकरण",
      "Cloud-Native Architecture",
      "Kubernetes",
      "Team Topologies",
      "साइकिलिंग",
      "बैडमिंटन",
      "Open Source",
    ],

    certifications: [
      "Liquibase Certified Practitioner",
      "Microsoft Certified: Azure Fundamentals",
    ],

    projects: [
      {
        name: "Visualisation of BFT-SMaRt",
        period: "मार्च 2017 - मई 2017",
        association: "Universität Passau",
        description: "BFT-SmaRt डिस्ट्रिब्यूटेड सिस्टम के लिए विज़ुअलाइज़ेशन लाइब्रेरी जो सिस्टम डायग्राम, सिस्टम स्टैटिस्टिक्स, मैसेज एक्सचेंजेस और सर्वर्स और क्लाइंट के बीच कुल मैसेज एक्सचेंजेस दिखाती है। D3.js में विज़ुअलाइज़ेशंस।",
        technologies: ["Apache Kafka", "D3.js", "Python", "Node.js", "Java"],
      },
      {
        name: "BETO: Better Together",
        period: "फरवरी 2017 - अप्रैल 2017",
        association: "Universität Passau",
        description: "एक कम्युनिटी ऐप जहाँ लोग विभिन्न श्रेणियों में मदद और समय दे सकते हैं—साथ, भाषा निर्देश, कुकिंग नाइट्स, या बैंड फॉर्मेशन। ऑटोमेटेड ट्रांसलेशन के साथ इंटीग्रेटेड चैट।",
        technologies: ["Mobile Development", "Real-time Chat", "Translation API"],
      },
      {
        name: "CoRE Directories: Web Of Things",
        period: "अक्टूबर 2016 - फरवरी 2017",
        association: "Universität Passau",
        description: "COAP प्रोटोकॉल का उपयोग करके Web of Things इनिशिएटिव के लिए CoRE Directory डिस्कवरी मेथड का इम्प्लीमेंटेशन। नेटवर्क से कनेक्ट होने वाले IoT डिवाइसेज स्वचालित रूप से डायरेक्टरी में जुड़ जाते हैं।",
        technologies: ["COAP", "Node.js", "PostgreSQL", "Intel Galileo", "Java"],
      },
      {
        name: "FriendFinder",
        period: "अक्टूबर 2015 - फरवरी 2016",
        association: "Universität Passau",
        description: "आपके पास समान रुचियों वाले लोगों को खोजने के लिए iOS एप्लिकेशन। Facebook प्रोफाइल्स और यूजर डिस्क्रिप्शंस से इंटरेस्ट्स मैच करने के लिए NLP एल्गोरिदम का उपयोग करने वाला Machine Learning बैकएंड।",
        technologies: ["Swift", "Python", "Apache Lucene", "NLP", "iOS"],
      },
    ],
  },
};

export type AboutLang = keyof typeof aboutData;
