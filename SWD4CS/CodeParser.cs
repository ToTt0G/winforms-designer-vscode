using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Microsoft.CodeAnalysis;
using Microsoft.CodeAnalysis.CSharp;
using Microsoft.CodeAnalysis.CSharp.Syntax;

namespace SWD4CS
{
    public struct CONTROL_INFO
    {
        public string? ctrlName = "";
        public string? ctrlClassName = "";
        public List<string> propertyName = new();
        public List<string> strProperty = new();
        public string? parent = "";
        public List<string> eventName = new();
        public List<string> eventFunc = new();
        public int panelNum = 0;
        public CONTROL_INFO() { }
    }

    public struct FILE_INFO
    {
        public string source_FileName = "";
        public List<string> source_base = new();
        public string filePath = "";
        public List<CONTROL_INFO> ctrlInfo = new();
        public string formName = "";

        public FILE_INFO() { }
    }

    public class CodeParser
    {
        public static FILE_INFO Parse(string filePath)
        {
            var fileInfo = new FILE_INFO();
            fileInfo.source_FileName = filePath;

            string code = File.ReadAllText(filePath);
            SyntaxTree tree = CSharpSyntaxTree.ParseText(code);
            CompilationUnitSyntax root = tree.GetCompilationUnitRoot();

            // 1. Get Form Class Name
            var classDecl = root.DescendantNodes().OfType<ClassDeclarationSyntax>().FirstOrDefault();
            if (classDecl != null)
            {
                fileInfo.formName = classDecl.Identifier.Text;
            }

            // 2. Find InitializeComponent method
            var method = root.DescendantNodes().OfType<MethodDeclarationSyntax>()
                .FirstOrDefault(m => m.Identifier.Text == "InitializeComponent");

            if (method == null) return fileInfo;

            // 3. Extract source_base
            string[] lines = code.Split(Environment.NewLine);
            int initLineIndex = -1;
            for(int i=0; i<lines.Length; i++)
            {
                if(lines[i].Contains("InitializeComponent") && lines[i].Contains("void"))
                {
                    initLineIndex = i;
                    break;
                }
            }

            if (initLineIndex != -1)
            {
                for(int i=0; i<=initLineIndex; i++)
                {
                    fileInfo.source_base.Add(lines[i]);
                }
            }

            // 4. Parse the body of InitializeComponent
            var methodBody = method.Body;
            if (methodBody == null) return fileInfo;

            // Add "this" (Form) control info first
            CONTROL_INFO formCtrl = new CONTROL_INFO();
            formCtrl.ctrlName = "this";
            formCtrl.ctrlClassName = "Form";
            fileInfo.ctrlInfo.Add(formCtrl);

            var statements = methodBody.Statements;
            foreach (var stmt in statements)
            {
                if (stmt is ExpressionStatementSyntax exprStmt)
                {
                    ParseExpression(exprStmt.Expression, ref fileInfo);
                }
            }

            return fileInfo;
        }

        private static void ParseExpression(ExpressionSyntax expr, ref FILE_INFO fileInfo)
        {
            // Case 1: Simple Assignment (Property set or Instantiation)
            if (expr is AssignmentExpressionSyntax assignment && assignment.Kind() == SyntaxKind.SimpleAssignmentExpression)
            {
                string right = assignment.Right.ToString();
                bool isProperty = false;
                string ctrlName = "";
                string propName = "";

                string leftAccess = assignment.Left.ToString();
                if (leftAccess.StartsWith("this.")) leftAccess = leftAccess.Substring(5);

                string[] parts = leftAccess.Split('.');

                if (parts.Length > 1)
                {
                    if (assignment.Left is MemberAccessExpressionSyntax memberAccess)
                    {
                        if (memberAccess.Expression is ThisExpressionSyntax)
                        {
                            if (assignment.Right is ObjectCreationExpressionSyntax objCreation)
                            {
                                string typeName = objCreation.Type.ToString();
                                if (IsStructType(typeName))
                                {
                                    ctrlName = "this";
                                    propName = memberAccess.Name.Identifier.Text;
                                    isProperty = true;
                                }
                                else
                                {
                                    ctrlName = memberAccess.Name.Identifier.Text;
                                    isProperty = false;
                                }
                            }
                            else
                            {
                                ctrlName = "this";
                                propName = memberAccess.Name.Identifier.Text;
                                isProperty = true;
                            }
                        }
                        else
                        {
                            string exprStr = memberAccess.Expression.ToString();
                            ctrlName = GetControlNameFromAccessString(exprStr);
                            propName = memberAccess.Name.Identifier.Text;
                            isProperty = true;
                        }
                    }
                    else if (assignment.Left is IdentifierNameSyntax identifier)
                    {
                        ctrlName = identifier.Identifier.Text;
                        if (assignment.Right is ObjectCreationExpressionSyntax objCreation && !IsStructType(objCreation.Type.ToString()))
                        {
                            isProperty = false;
                        }
                        else
                        {
                            propName = ctrlName;
                            ctrlName = "this";
                            isProperty = true;
                        }
                    }
                }
                else
                {
                    ctrlName = leftAccess;
                     if (assignment.Right is ObjectCreationExpressionSyntax objCreation && !IsStructType(objCreation.Type.ToString()))
                    {
                        isProperty = false;
                    }
                    else
                    {
                        propName = ctrlName;
                        ctrlName = "this";
                        isProperty = true;
                    }
                }

                if (isProperty)
                {
                    AddPropertyToControl(ref fileInfo, ctrlName, propName, right);
                }
                else
                {
                    if (assignment.Right is ObjectCreationExpressionSyntax objCreation)
                    {
                        string className = objCreation.Type.ToString().Split('.').Last();
                        CONTROL_INFO ctrl = new CONTROL_INFO();
                        ctrl.ctrlName = ctrlName;
                        ctrl.ctrlClassName = className;
                        fileInfo.ctrlInfo.Add(ctrl);
                    }
                }
            }
            // Case 2: Event Subscription (+=)
            else if (expr is AssignmentExpressionSyntax addAssign && addAssign.Kind() == SyntaxKind.AddAssignmentExpression)
            {
                string left = addAssign.Left.ToString();
                string ctrlName = "this";
                string eventName = "";

                if (addAssign.Left is MemberAccessExpressionSyntax memberAccess)
                {
                     string exprStr = memberAccess.Expression.ToString();
                     if (exprStr == "this")
                     {
                         ctrlName = "this";
                     }
                     else
                     {
                         ctrlName = GetControlNameFromAccessString(exprStr);
                     }
                     eventName = memberAccess.Name.Identifier.Text;
                }
                else
                {
                    eventName = left;
                }

                string funcName = "";
                if (addAssign.Right is ObjectCreationExpressionSyntax objCreation)
                {
                    if (objCreation.ArgumentList != null && objCreation.ArgumentList.Arguments.Count > 0)
                    {
                        funcName = objCreation.ArgumentList.Arguments[0].ToString();
                        if (funcName.StartsWith("this.")) funcName = funcName.Substring(5);
                    }
                }

                if (!string.IsNullOrEmpty(funcName))
                {
                    AddEventToControl(ref fileInfo, ctrlName, eventName, funcName);
                }
            }
            // Case 3: Method Invocation (Controls.Add)
            else if (expr is InvocationExpressionSyntax invoke)
            {
                string methodCall = invoke.Expression.ToString();

                if (methodCall.EndsWith(".Controls.Add"))
                {
                    string parentAccess = methodCall.Substring(0, methodCall.Length - ".Controls.Add".Length);
                    string parentName = GetControlNameFromAccessString(parentAccess);

                    if (invoke.ArgumentList.Arguments.Count > 0)
                    {
                        string childAccess = invoke.ArgumentList.Arguments[0].ToString();
                        string childName = GetControlNameFromAccessString(childAccess);

                        int index = fileInfo.ctrlInfo.FindIndex(c => c.ctrlName == childName);
                        if (index != -1)
                        {
                            var ctrl = fileInfo.ctrlInfo[index];
                            if (parentName.EndsWith(".Panel1"))
                            {
                                ctrl.parent = parentName.Substring(0, parentName.Length - 7);
                                ctrl.panelNum = 1;
                            }
                            else if (parentName.EndsWith(".Panel2"))
                            {
                                ctrl.parent = parentName.Substring(0, parentName.Length - 7);
                                ctrl.panelNum = 2;
                            }
                            else
                            {
                                ctrl.parent = parentName;
                                ctrl.panelNum = 0;
                            }
                            fileInfo.ctrlInfo[index] = ctrl;
                        }
                    }
                }
            }
        }

        private static bool IsStructType(string typeName)
        {
            return typeName.Contains("Point") ||
                   typeName.Contains("Size") ||
                   typeName.Contains("Font") ||
                   typeName.Contains("Color") ||
                   typeName.Contains("Padding");
        }

        private static string GetControlNameFromAccessString(string access)
        {
            if (access == "this") return "this";
            if (access.StartsWith("this.")) return access.Substring(5);
            return access;
        }

        private static void AddPropertyToControl(ref FILE_INFO fileInfo, string ctrlName, string propName, string value)
        {
            int index = fileInfo.ctrlInfo.FindIndex(c => c.ctrlName == ctrlName);
            if (index != -1)
            {
                var ctrl = fileInfo.ctrlInfo[index];
                ctrl.propertyName.Add(propName);
                ctrl.strProperty.Add(value);
                fileInfo.ctrlInfo[index] = ctrl;
            }
        }

        private static void AddEventToControl(ref FILE_INFO fileInfo, string ctrlName, string eventName, string funcName)
        {
            int index = fileInfo.ctrlInfo.FindIndex(c => c.ctrlName == ctrlName);
            if (index != -1)
            {
                var ctrl = fileInfo.ctrlInfo[index];
                ctrl.eventName.Add(eventName);
                ctrl.eventFunc.Add(funcName);
                fileInfo.ctrlInfo[index] = ctrl;
            }
        }
    }
}
