import Foundation
import XcodeProj
import PathKit
let path = Path(CommandLine.arguments[1])
let project = try XcodeProj(path: path)
let pbx = project.pbxproj
let target = pbx.nativeTargets.first!
let group = pbx.groups.first(where: {$0.name == "LuggEase"})!
if !pbx.fileReferences.contains(where: {$0.path == "LuggEase/GoogleService-Info.plist"}) {
    let ref = PBXFileReference(sourceTree: .group, name: "GoogleService-Info.plist", lastKnownFileType: "text.plist.xml", path: "LuggEase/GoogleService-Info.plist")
    pbx.add(object: ref)
    group.children.append(ref)
    let build = PBXBuildFile(file: ref)
    pbx.add(object: build)
    let resources = target.buildPhases.compactMap {$0 as? PBXResourcesBuildPhase}.first!
    resources.files = (resources.files ?? []) + [build]
}
for configuration in target.buildConfigurationList!.buildConfigurations {
    configuration.buildSettings["PRODUCT_BUNDLE_IDENTIFIER"] = "in.innovease.luggease"
    var flags = configuration.buildSettings["OTHER_LDFLAGS"] as? [String] ?? ["$(inherited)"]
    if !flags.contains("-ObjC") { flags.append("-ObjC") }
    configuration.buildSettings["OTHER_LDFLAGS"] = flags
}

// Add a real-device UI smoke-test target using XcodeProj, without text edits to project files.
var uiTarget = pbx.nativeTargets.first(where: {$0.name == "LuggEaseUITests"})
if uiTarget == nil {
    let settings: [String: Any] = [
      "PRODUCT_BUNDLE_IDENTIFIER": "in.innovease.luggease.uitests",
      "PRODUCT_NAME": "$(TARGET_NAME)", "SWIFT_VERSION": "5.0",
      "GENERATE_INFOPLIST_FILE": "YES", "IPHONEOS_DEPLOYMENT_TARGET": "16.1",
      "SDKROOT": "iphoneos", "TARGETED_DEVICE_FAMILY": "1,2",
      "CODE_SIGN_STYLE": "Automatic", "DEVELOPMENT_TEAM": "TU2WC94GP6",
      "TEST_TARGET_NAME": "LuggEase", "ENABLE_TESTING_SEARCH_PATHS": "YES"
    ]
    let configs = ["Debug", "Release"].map { XCBuildConfiguration(name: $0, buildSettings: settings) }
    configs.forEach {pbx.add(object: $0)}
    let list = XCConfigurationList(buildConfigurations: configs, defaultConfigurationName: "Release")
    pbx.add(object: list)
    let source = PBXFileReference(sourceTree: .group, lastKnownFileType: "sourcecode.swift", path: "SmokeTests.swift")
    pbx.add(object: source)
    let testGroup = PBXGroup(children: [source], sourceTree: .group, name: "LuggEaseUITests", path: "LuggEaseUITests")
    pbx.add(object: testGroup)
    pbx.projects.first!.mainGroup.children.append(testGroup)
    let buildFile = PBXBuildFile(file: source)
    pbx.add(object: buildFile)
    let sources = PBXSourcesBuildPhase(files: [buildFile])
    let frameworks = PBXFrameworksBuildPhase()
    pbx.add(object: sources); pbx.add(object: frameworks)
    let product = PBXFileReference(sourceTree: .buildProductsDir, explicitFileType: "wrapper.cfbundle", path: "LuggEaseUITests.xctest")
    pbx.add(object: product)
    pbx.groups.first(where: {$0.name == "Products"})?.children.append(product)
    let tests = PBXNativeTarget(name: "LuggEaseUITests", buildConfigurationList: list, buildPhases: [sources, frameworks], productName: "LuggEaseUITests", product: product, productType: .uiTestBundle)
    pbx.add(object: tests)
    pbx.projects.first!.targets.append(tests)
    _ = try tests.addDependency(target: target)
    uiTarget = tests
}
for configuration in target.buildConfigurationList!.buildConfigurations {
    configuration.buildSettings["IPHONEOS_DEPLOYMENT_TARGET"] = "16.1"
    configuration.buildSettings["DEVELOPMENT_TEAM"] = "TU2WC94GP6"
    configuration.buildSettings["CODE_SIGN_STYLE"] = "Automatic"
}
try project.write(path: path)
let schemePath = path + "xcshareddata/xcschemes/LuggEase.xcscheme"
let scheme = try XCScheme(path: schemePath)
let ref = XCScheme.BuildableReference(referencedContainer: "container:LuggEase.xcodeproj", blueprint: uiTarget!, buildableName: "LuggEaseUITests.xctest", blueprintName: "LuggEaseUITests")
scheme.testAction = XCScheme.TestAction(buildConfiguration: "Release", macroExpansion: nil, testables: [XCScheme.TestableReference(skipped: false, parallelization: .none, buildableReference: ref)])
try scheme.write(path: schemePath, override: true)
let podsPath = path.parent() + "Pods/Pods.xcodeproj"
if podsPath.exists {
    let pods = try XcodeProj(path: podsPath)
    for config in pods.pbxproj.buildConfigurations {
        if let version = config.buildSettings["IPHONEOS_DEPLOYMENT_TARGET"] as? String,
           (Double(version) ?? 0) < 16.1 {
            config.buildSettings["IPHONEOS_DEPLOYMENT_TARGET"] = "16.1"
        }
    }
    try pods.write(path: podsPath)
}
print("Configured Firebase resources, deployment targets and device UI tests")
