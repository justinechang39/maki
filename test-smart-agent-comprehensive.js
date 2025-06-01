#!/usr/bin/env node

/**
 * Comprehensive Smart File Agent Test Suite
 * 
 * Sets up a proper test environment and runs comprehensive tests
 * to verify the smart file tools are working correctly.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';

const TEST_WORKSPACE = 'file_assistant_workspace';
const TEST_RESULTS_FILE = 'test-results.json';

// Test configuration
const TESTS = [
  {
    id: 'induction_workflow',
    name: 'Critical Induction Workflow Test',
    description: 'Get images from induction folders, copy to new folder, rename with creation dates',
    query: "get all the images from the folders with 'induction' in the name, then copy them into a new folder called 'induction images', then rename the copied files to have their creation dates appended to them",
    expectedOperations: ['processFiles', 'batchRename'],
    expectedResults: {
      foldersFound: 2,
      imagesFound: 4,
      imagesCopied: 4,
      filesRenamed: 4,
      newFolderCreated: true
    }
  },
  {
    id: 'simple_discovery',
    name: 'Simple File Discovery Test',
    description: 'Test basic file discovery functionality',
    query: "find all jpg images in the test folders",
    expectedOperations: ['findFiles'],
    expectedResults: {
      imagesFound: 6
    }
  },
  {
    id: 'batch_rename_test',
    name: 'Batch Rename Test',
    description: 'Test batch renaming with date patterns',
    query: "rename all jpg files in the sample_images folder to include the current date",
    expectedOperations: ['batchRename'],
    expectedResults: {
      filesRenamed: 3
    }
  },
  {
    id: 'organization_test',
    name: 'File Organization Test',
    description: 'Test rule-based file organization',
    query: "organize files in the mixed_files folder - put images in an images subfolder and documents in a docs subfolder",
    expectedOperations: ['organizeFiles'],
    expectedResults: {
      filesOrganized: 6
    }
  },
  {
    id: 'multi_step_workflow',
    name: 'Multi-Step Workflow Test',
    description: 'Test complex multi-step file operations',
    query: "find all large images (bigger than 10KB), copy them to a new folder called 'large_images', and rename them with sequential numbers",
    expectedOperations: ['processFiles', 'batchRename'],
    expectedResults: {
      largeImagesFound: 2,
      imagesCopied: 2,
      filesRenamed: 2
    }
  }
];

/**
 * Set up comprehensive test environment
 */
function setupTestEnvironment() {
  console.log('🏗️  Setting up comprehensive test environment...');
  
  // Clean up any existing test workspace
  if (fs.existsSync(TEST_WORKSPACE)) {
    execSync(`rm -rf ${TEST_WORKSPACE}`, { stdio: 'pipe' });
  }
  
  // Create main workspace
  fs.mkdirSync(TEST_WORKSPACE, { recursive: true });
  
  // Create test folder structure
  const testStructure = {
    // Induction folders (main test case)
    'machine_induction_training': {
      'diagram.png': createTestImage('PNG diagram'),
      'photo1.jpg': createTestImage('Training photo 1'),
      'manual.pdf': 'PDF content for manual',
      'notes.txt': 'Training notes content'
    },
    'project_induction_2023': {
      'image1.jpg': createTestImage('Project image 1'),
      'image2.png': createTestImage('Project image 2'),
      'report.docx': 'Project report content',
      'data.csv': 'name,value\ntest1,100\ntest2,200'
    },
    'other_training': {
      'video.mp4': 'Video content',
      'audio.mp3': 'Audio content'
    },
    // Sample images folder for rename tests
    'sample_images': {
      'photo_a.jpg': createTestImage('Photo A'),
      'photo_b.jpg': createTestImage('Photo B'), 
      'photo_c.jpg': createTestImage('Photo C')
    },
    // Mixed files for organization tests
    'mixed_files': {
      'document1.pdf': 'Document 1 content',
      'document2.txt': 'Document 2 content',
      'image_x.jpg': createTestImage('Image X'),
      'image_y.png': createTestImage('Image Y'),
      'presentation.pptx': 'Presentation content',
      'spreadsheet.xlsx': 'Spreadsheet content'
    },
    // Large images for size-based tests
    'test_images': {
      'small_image.jpg': createTestImage('Small', 100), // Small image
      'large_image1.jpg': createTestImage('Large 1', 15000), // Large image
      'large_image2.png': createTestImage('Large 2', 20000), // Large image
      'medium_image.jpg': createTestImage('Medium', 5000) // Medium image
    }
  };
  
  // Create the folder structure
  createTestStructure(TEST_WORKSPACE, testStructure);
  
  console.log('✅ Test environment setup complete');
  console.log(`📁 Created test workspace: ${TEST_WORKSPACE}`);
  console.log('📊 Test structure:');
  console.log('   - 2 induction folders with 4 images total');
  console.log('   - 1 sample_images folder with 3 jpg files');
  console.log('   - 1 mixed_files folder with 6 files (images + documents)');
  console.log('   - 1 test_images folder with 4 images of varying sizes');
}

/**
 * Create test file structure recursively
 */
function createTestStructure(basePath, structure) {
  for (const [name, content] of Object.entries(structure)) {
    const fullPath = path.join(basePath, name);
    
    if (typeof content === 'object') {
      // It's a directory
      fs.mkdirSync(fullPath, { recursive: true });
      createTestStructure(fullPath, content);
    } else {
      // It's a file
      fs.writeFileSync(fullPath, content);
    }
  }
}

/**
 * Create a test image file with specified content and size
 */
function createTestImage(description, size = 1000) {
  // Create a simple "image" file with specified size
  const content = `FAKE_IMAGE_${description}_${Date.now()}`;
  const padding = 'X'.repeat(Math.max(0, size - content.length));
  return content + padding;
}

/**
 * Run a single test case
 */
async function runTest(test) {
  console.log(`\n🧪 Running Test: ${test.name}`);
  console.log(`📝 Description: ${test.description}`);
  console.log(`❓ Query: "${test.query}"`);
  console.log('⏱️  Starting test execution...');
  
  const startTime = Date.now();
  
  try {
    // Run the agent with the test query
    const result = execSync(
      `node dist/cli/ink.js --test --query="${test.query}"`,
      { 
        encoding: 'utf8',
        maxBuffer: 1024 * 1024 * 10, // 10MB buffer
        timeout: 120000 // 2 minute timeout
      }
    );
    
    const duration = Date.now() - startTime;
    
    console.log(`✅ Test completed in ${duration}ms`);
    
    // Parse and verify results
    const verification = verifyTestResults(test, result);
    
    return {
      id: test.id,
      name: test.name,
      success: verification.success,
      duration: duration,
      output: result,
      verification: verification,
      timestamp: new Date().toISOString()
    };
    
  } catch (error) {
    const duration = Date.now() - startTime;
    console.log(`❌ Test failed after ${duration}ms`);
    console.log(`Error: ${error.message}`);
    
    return {
      id: test.id,
      name: test.name,
      success: false,
      duration: duration,
      error: error.message,
      timestamp: new Date().toISOString()
    };
  }
}

/**
 * Verify test results against expected outcomes
 */
function verifyTestResults(test, output) {
  console.log('🔍 Verifying test results...');
  
  const verification = {
    success: true,
    checks: [],
    actualResults: {}
  };
  
  // Check if expected operations were used
  for (const expectedOp of test.expectedOperations) {
    const opUsed = output.includes(expectedOp);
    verification.checks.push({
      type: 'operation',
      description: `Used ${expectedOp} tool`,
      expected: true,
      actual: opUsed,
      passed: opUsed
    });
    if (!opUsed) verification.success = false;
  }
  
  // Check file system results (specific to test type)
  if (test.id === 'induction_workflow') {
    // Check for both possible folder names in workspace and project root
    const inductionFolder1 = fs.existsSync(path.join(TEST_WORKSPACE, 'induction images'));
    const inductionFolder2 = fs.existsSync(path.join(TEST_WORKSPACE, 'induction_images'));
    const inductionFolder3 = fs.existsSync('induction images');
    const inductionFolder4 = fs.existsSync('induction_images');
    const inductionFolderExists = inductionFolder1 || inductionFolder2 || inductionFolder3 || inductionFolder4;
    
    let actualFolderName = 'none';
    let folderLocation = 'none';
    if (inductionFolder1) { actualFolderName = 'induction images'; folderLocation = 'workspace'; }
    else if (inductionFolder2) { actualFolderName = 'induction_images'; folderLocation = 'workspace'; }
    else if (inductionFolder3) { actualFolderName = 'induction images'; folderLocation = 'project root'; }
    else if (inductionFolder4) { actualFolderName = 'induction_images'; folderLocation = 'project root'; }
    
    verification.checks.push({
      type: 'filesystem',
      description: 'Created induction images folder',
      expected: true,
      actual: inductionFolderExists,
      passed: inductionFolderExists,
      details: `Found folder: ${actualFolderName} (location: ${folderLocation})`
    });
    
    if (inductionFolderExists) {
      let folderPath;
      if (inductionFolder1) folderPath = path.join(TEST_WORKSPACE, 'induction images');
      else if (inductionFolder2) folderPath = path.join(TEST_WORKSPACE, 'induction_images');
      else if (inductionFolder3) folderPath = 'induction images';
      else if (inductionFolder4) folderPath = 'induction_images';
      const copiedFiles = fs.readdirSync(folderPath);
      const expectedFileCount = test.expectedResults.imagesCopied;
      const actualFileCount = copiedFiles.length;
      
      verification.checks.push({
        type: 'filesystem',
        description: `Copied ${expectedFileCount} image files`,
        expected: expectedFileCount,
        actual: actualFileCount,
        passed: actualFileCount === expectedFileCount,
        details: `Files found: ${copiedFiles.join(', ')}`
      });
      
      // Check if files were renamed with dates
      const renamedWithDates = copiedFiles.filter(file => /^\d{4}-\d{2}-\d{2}_/.test(file)).length;
      verification.checks.push({
        type: 'filesystem',
        description: 'Files renamed with date prefix',
        expected: expectedFileCount,
        actual: renamedWithDates,
        passed: renamedWithDates === expectedFileCount,
        details: `Date-prefixed files: ${copiedFiles.filter(file => /^\d{4}-\d{2}-\d{2}_/.test(file)).join(', ')}`
      });
      
      verification.actualResults = { copiedFiles, renamedWithDates, folderName: actualFolderName };
      
      if (actualFileCount !== expectedFileCount || renamedWithDates !== expectedFileCount) {
        verification.success = false;
      }
    } else {
      verification.success = false;
    }
  }
  
  // Log verification results
  console.log('📊 Verification Results:');
  for (const check of verification.checks) {
    const status = check.passed ? '✅' : '❌';
    console.log(`   ${status} ${check.description}: ${check.actual} (expected: ${check.expected})`);
    if (check.details) {
      console.log(`      Details: ${check.details}`);
    }
  }
  
  return verification;
}

/**
 * Run all tests and generate report
 */
async function runAllTests() {
  console.log('🚀 Starting Comprehensive Smart File Agent Test Suite');
  console.log(`📅 Started at: ${new Date().toISOString()}`);
  console.log(`🧪 Total tests: ${TESTS.length}`);
  
  setupTestEnvironment();
  
  const results = [];
  let passedTests = 0;
  
  for (const test of TESTS) {
    const result = await runTest(test);
    results.push(result);
    
    if (result.success) {
      passedTests++;
      console.log(`✅ ${test.name} - PASSED`);
    } else {
      console.log(`❌ ${test.name} - FAILED`);
    }
  }
  
  // Generate test report
  const report = {
    summary: {
      totalTests: TESTS.length,
      passedTests: passedTests,
      failedTests: TESTS.length - passedTests,
      successRate: `${Math.round((passedTests / TESTS.length) * 100)}%`,
      timestamp: new Date().toISOString()
    },
    results: results
  };
  
  // Save results to file
  fs.writeFileSync(TEST_RESULTS_FILE, JSON.stringify(report, null, 2));
  
  // Print final report
  console.log('\n📋 FINAL TEST REPORT');
  console.log('====================');
  console.log(`✅ Passed: ${passedTests}/${TESTS.length}`);
  console.log(`❌ Failed: ${TESTS.length - passedTests}/${TESTS.length}`);
  console.log(`📊 Success Rate: ${report.summary.successRate}`);
  console.log(`📄 Detailed results saved to: ${TEST_RESULTS_FILE}`);
  
  if (passedTests === TESTS.length) {
    console.log('\n🎉 ALL TESTS PASSED! Smart file agent is working perfectly.');
  } else {
    console.log('\n⚠️  Some tests failed. Check the detailed results for debugging.');
  }
  
  return report;
}

/**
 * Clean up test environment
 */
function cleanup() {
  console.log('\n🧹 Cleaning up test environment...');
  if (fs.existsSync(TEST_WORKSPACE)) {
    execSync(`rm -rf ${TEST_WORKSPACE}`, { stdio: 'pipe' });
    console.log('✅ Test workspace cleaned up');
  }
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runAllTests();
  } catch (error) {
    console.error('💥 Test suite failed:', error);
    process.exit(1);
  } finally {
    cleanup();
  }
}

export { runAllTests, setupTestEnvironment, cleanup };
