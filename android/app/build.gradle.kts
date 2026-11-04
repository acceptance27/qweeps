plugins {
    id("com.android.application")
    id("com.chaquo.python")
}
android {
    namespace = "org.qweeps.app"
    compileSdk = 35
    defaultConfig {
        applicationId = "org.qweeps.app"
        minSdk = 26
        targetSdk = 35
        testInstrumentationRunner = "androidx.test.runner.AndroidJUnitRunner"
        versionCode = 1
        versionName = "0.1.0"
        ndk { abiFilters += listOf("arm64-v8a", "x86_64") }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    buildTypes {
        release {
            isMinifyEnabled = false
            signingConfig = signingConfigs.getByName("debug")
        }
    }
    sourceSets["main"].assets.srcDir(layout.buildDirectory.dir("generated/qweepsAssets"))
    packaging { resources.excludes += setOf("META-INF/DEPENDENCIES", "META-INF/LICENSE*") }
}
chaquopy {
    defaultConfig {
        version = "3.11"
        buildPython(System.getenv("QWEEPS_BUILD_PYTHON") ?: "python3.11")
        pip { install("pypdf==6.0.0") }
        extractPackages("assistant")
    }
    sourceSets.getByName("main") { srcDir("../../src") }
}
val prepareStudio by tasks.registering(Sync::class) {
    val studio = rootProject.projectDir.resolve("../visual-studio")
    from(studio.resolve("dist")) { into("studio/dist") }
    from(studio.resolve("public")) { into("studio/public") }
    from(rootProject.projectDir.resolve("../bundled-lessons")) { into("studio/bundled-lessons") }
    from(studio.resolve("src/live")) { include("*.json"); into("studio/src/live") }
    into(layout.buildDirectory.dir("generated/qweepsAssets"))
    doFirst { check(studio.resolve("dist/index.html").isFile) { "Run npm run build from the repository root first." } }
}
tasks.named("preBuild") { dependsOn(prepareStudio) }

dependencies {
    androidTestImplementation("androidx.test:runner:1.6.2")
    androidTestImplementation("androidx.test.ext:junit:1.2.1")
}
