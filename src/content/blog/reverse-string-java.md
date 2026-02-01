---
title: "How to Reverse a String in Java"
description: "Learn multiple ways to reverse a string in Java, from traditional for loops to using StringBuilder."
date: 2020-05-06
tags: ["java", "beginner", "tutorial"]
image: "/images/java.jpg"
---

There are multiple ways to reverse a given string in Java. The more traditional way to do this is by using the plain old `for-loop`. But Java also has built-in data structures that provide different ways to achieve this.

## How to reverse a string in Java using traditional for loop

```java
public class ReverseString {
    public static void main(String[] args){
        System.out.println("Reversing a string using a for loop");  // initial print statement

        // this is the string we want to reverse.
        String stringToReverse = "AsampleStringToReverse";

        // A variable that will hold the reversed string
        String reversedString = "";

        // we loop through each character in the string in backward manner
        // and save each character in the variable we created above
        for (int i = stringToReverse.length() - 1; i >= 0; i--) {
            reversedString = reversedString + stringToReverse.charAt(i);
        }

        // here, the string should have been reversed. We print it to the console.
        System.out.println("Reversed string is: ");
        System.out.println(reversedString);
    }
}
```

## How to reverse a String in Java using StringBuilder

```java
public class ReverseString {
    public static void main(String[] args){
        System.out.println("Reversing a string using a for loop");  // initial print statement

        // this is the string we want to reverse.
        String stringToReverse = "AsampleStringToReverse";

        // We initialize the String builder with the string we want to reverse
        StringBuilder builder = new StringBuilder(stringToReverse);

        // and use the "reverse" function to reverse the string
        // because this is a StringBuilder instance we need to convert it to a string using "toString()"
        String reversedString = builder.reverse().toString();

        // here, the string should have been reversed. We print it to the console.
        System.out.println("Reversed string is: ");
        // because the reversed string was saved in StringBuilder object, we need to convert it to a string first
        System.out.println(reversedString.toString());
    }
}
```

---

*Photo by Maximilian Weisbecker on Unsplash*
