Pod::Spec.new do |s|
  s.name           = 'ContinuedWork'
  s.version        = '1.0.0'
  s.summary        = 'Keeps user-started work running after the app is backgrounded'
  s.description    = 'BGContinuedProcessingTask on iOS 26 and newer, with the system Live Activity showing progress'
  s.author         = ''
  s.homepage       = 'https://docs.expo.dev/modules/'
  s.platforms      = { :ios => '17.0' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true

  s.dependency 'ExpoModulesCore'
  s.frameworks = 'BackgroundTasks'

  # Swift/Objective-C compatibility
  s.pod_target_xcconfig = {
    'DEFINES_MODULE' => 'YES',
  }

  s.source_files = "**/*.{h,m,mm,swift}"
end
